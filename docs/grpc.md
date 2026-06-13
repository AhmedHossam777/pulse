# gRPC in Pulse

This document explains how gRPC is wired up in this monorepo: the contract, the
server, the client, the shared types, and the one build step that is easy to
forget (copying the `.proto` into the build output).

## Overview

Pulse has two NestJS apps that talk over gRPC:

| App | Role | Transport | Address |
| --- | --- | --- | --- |
| `apps/api-getway` | HTTP gateway / **gRPC client** | HTTP in, gRPC out | HTTP `:3333`, calls gRPC `127.0.0.1:4001` |
| `apps/notifications` | Notification worker / **gRPC server** | gRPC only | gRPC `0.0.0.0:4001` |

The gateway exposes a REST API to the outside world and, under the hood,
forwards each call to the `notifications` microservice over gRPC. Clients never
speak gRPC directly — they only see HTTP.

```
HTTP client ──REST──▶ api-getway ──gRPC──▶ notifications
                       (gRPC client)        (gRPC server)
```

## The contract: `libs/shared/proto/notification.proto`

The `.proto` file is the **single source of truth** for the service. It lives in
the shared lib so both apps reference the exact same file.

```proto
syntax = "proto3";

package notification;

service NotificationService {
  rpc Send (SendRequest) returns (SendResponse);
  rpc GetStatus (GetStatusRequest) returns (GetStatusResponse);
}

message SendRequest    { string channel = 1; string recipient = 2; string subject = 3; string body = 4; }
message SendResponse   { string id = 1; string status = 2; }
message GetStatusRequest  { string id = 1; }
message GetStatusResponse { string id = 1; string status = 2; } // PENDING | SENT | FAILED
```

Key facts:

- **Package name** is `notification`. Both the server and the client must
  register this package name, and it is exported as
  `grpc.NOTIFICATION_PACKAGE` so the string is never duplicated by hand.
- **Service name** is `NotificationService`, exported as
  `grpc.NOTIFICATION_SERVICE`.
- **RPC method names are PascalCase** in proto (`Send`, `GetStatus`) but the
  generated/typed client exposes them as **camelCase** (`send`, `getStatus`).

## Shared TypeScript types: `libs/shared/src/lib/grpc/notification.types.ts`

This project does **not** auto-generate types from the proto. Instead it
hand-maintains matching TS interfaces. **If you change the proto, change these
too** (and vice versa).

```ts
export const NOTIFICATION_PACKAGE = 'notification';
export const NOTIFICATION_SERVICE = 'NotificationService';

export interface SendRequest { channel: string; recipient: string; subject: string; body: string; }
export interface SendResponse { id: string; status: string; }
export interface GetStatusRequest { id: string; }
export interface GetStatusResponse { id: string; status: string; }

// The client-side view of the service. Methods return rxjs Observables
// because that is how @nestjs/microservices surfaces gRPC unary calls.
export interface NotificationGrpc {
  send(data: SendRequest): Observable<SendResponse>;
  getStatus(data: GetStatusRequest): Observable<GetStatusResponse>;
}
```

### Why it is namespaced as `grpc.*`

`libs/shared/src/index.ts` re-exports these types under a `grpc` namespace:

```ts
export * as grpc from './lib/grpc/notification.types';
```

This is deliberate. There is a **separate** messaging layer
(`libs/shared/src/lib/messaging/notification.messages.ts`) that also declares
`GetStatusRequest` / `GetStatusResponse`, but with a richer
`status: NotificationStatus` (`'PENDING' | 'SENT' | 'FAILED'`) instead of the
proto's plain `string`. Namespacing avoids the name collision and makes it
obvious which transport you are using:

- `import { grpc } from '@pulse/shared'` → gRPC wire types (`status: string`).
- `import { GetStatusResponse } from '@pulse/shared'` → messaging type
  (`status: NotificationStatus`).

> ⚠️ Use the `grpc.*` types in anything that touches the gRPC client/server.
> Mixing the two is what caused the original `status` type mismatch (`string`
> vs `NotificationStatus`).

## Server side — `apps/notifications`

### Bootstrap as a gRPC microservice (`src/main.ts`)

The notifications app is a **pure microservice** (no HTTP server). It is created
with `createMicroservice` and the gRPC transport:

```ts
const url = process.env.NOTIFICATION_GRPC_URL ?? '0.0.0.0:4001';

const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.GRPC,
  options: {
    package: grpc.NOTIFICATION_PACKAGE,                 // 'notification'
    protoPath: join(__dirname, 'proto/notification.proto'),
    url,
  },
});

await app.listen();
```

- Listens on `0.0.0.0:4001` by default; override with `NOTIFICATION_GRPC_URL`.
- `protoPath` is resolved **relative to the compiled output** (`__dirname` →
  `dist/`), i.e. `dist/proto/notification.proto`. See
  [Build step](#build-step-copying-the-proto) below.

### Implementing RPC methods (`src/app/notification.controller.ts`)

gRPC handlers are just controller methods decorated with `@GrpcMethod`. The
first argument is the **service name**, the second is the **RPC method name** as
written in the proto (PascalCase):

```ts
@Controller()
export class NotificationsConsumer {
  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'Send')
  send(data: grpc.SendRequest): grpc.SendResponse {
    const id = randomUUID();
    void this.deliver(id, data);  // slow work runs after we ACK
    return { id, status: 'ACCEPTED' };
  }

  @GrpcMethod(grpc.NOTIFICATION_SERVICE, 'GetStatus')
  getStatus(data: GetStatusRequest): GetStatusResponse {
    return { id: data.id, status: 'SENT' }; // faked until a DB is wired in
  }
}
```

Notes:

- These are **unary** (request → single response) RPCs. A handler returns the
  response object directly (or a `Promise`/`Observable` of it).
- `Send` follows an **ACK-then-work** pattern: it returns immediately with
  `status: 'ACCEPTED'` and runs the slow delivery (`deliver`) in the
  background. The unary response is just an acknowledgement, not the final
  delivery result.
- The controller is registered in `AppModule`
  (`controllers: [NotificationsConsumer]`).

## Client side — `apps/api-getway`

### Registering the gRPC client (`src/app/notification/notification.module.ts`)

The gateway registers a gRPC **client** via `ClientsModule.register`. The
injection token `'NOTIFICATIONS_PACKAGE'` is how the service grabs the client.

```ts
ClientsModule.register([
  {
    name: 'NOTIFICATIONS_PACKAGE',
    transport: Transport.GRPC,
    options: {
      package: grpc.NOTIFICATION_PACKAGE,                // must match the server
      protoPath: join(__dirname, 'proto/notification.proto'),
      url: '127.0.0.1:4001',                             // where the server listens
    },
  },
]),
```

### Calling the service (`src/app/notification/notification.service.ts`)

The typed service handle is fetched once in `onModuleInit` via
`client.getService<grpc.NotificationGrpc>(...)`. gRPC methods return rxjs
`Observable`s, so we convert them to promises with `firstValueFrom`:

```ts
@Injectable()
export class NotificationService implements OnModuleInit {
  private notificationGrpc!: grpc.NotificationGrpc;

  constructor(@Inject('NOTIFICATIONS_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.notificationGrpc = this.client.getService<grpc.NotificationGrpc>(
      grpc.NOTIFICATION_SERVICE,
    );
  }

  send(payload: grpc.SendRequest): Promise<grpc.SendResponse> {
    return firstValueFrom(this.notificationGrpc.send(payload));
  }

  status(id: string): Promise<grpc.GetStatusResponse> {
    return firstValueFrom(this.notificationGrpc.getStatus({ id }));
  }
}
```

### Exposing it over HTTP (`src/app/notification/notification.controller.ts`)

The REST controller is a thin layer that delegates to the service. Note the
explicit `grpc.*` return types — they match what the service returns and keep
TypeScript happy (no portability/`TS2742` warnings):

```ts
@Controller('notifications')
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Post()
  create(@Body() dto: CreateNotificationDto): Promise<grpc.SendResponse> {
    return this.service.send(dto);
  }

  @Get(':id/status')
  status(@Param('id') id: string): Promise<grpc.GetStatusResponse> {
    return this.service.status(id);
  }
}
```

## Build step: copying the `.proto`

Both apps load the proto with `join(__dirname, 'proto/notification.proto')`,
which at runtime resolves to `dist/proto/notification.proto`. But the proto file
actually lives in `libs/shared/proto/`. Webpack must **copy** it into each app's
build output, or you get this runtime crash:

```
Error: The invalid .proto definition (file at ".../dist/proto/notification.proto" not found)
```

Each app's `webpack.config.js` copies it via an `assets` entry on the
`NxAppWebpackPlugin`:

```js
assets: [
  { input: 'libs/shared/proto', glob: '**/*.proto', output: 'proto' },
],
```

- `input` is relative to the **workspace root** (no leading `./`).
- `output` is relative to the app's **dist** folder, so the proto lands at
  `dist/proto/notification.proto` — exactly the path the code loads.

> If you ever move the proto, or add a new one, update both
> `apps/api-getway/webpack.config.js` and `apps/notifications/webpack.config.js`.

## End-to-end request flow

```
1. POST /api/notifications              ── HTTP ──▶  api-getway: NotificationController.create()
2. service.send(dto)                                 api-getway: NotificationService
3. notificationGrpc.send(payload)       ── gRPC ──▶  notifications: NotificationsConsumer.send()
4. returns { id, status: 'ACCEPTED' }   ◀── gRPC ──   (and kicks off background deliver())
5. firstValueFrom resolves the Observable
6. HTTP 201 { id, status: 'ACCEPTED' }  ◀── HTTP ──   back to the original client
```

`GET /api/notifications/:id/status` follows the same path through `getStatus`.

## Running locally

```bash
# Terminal 1 — gRPC server
npx nx serve @pulse/notifications        # listens on 0.0.0.0:4001

# Terminal 2 — HTTP gateway (gRPC client)
npx nx serve @pulse/api-getway           # listens on http://localhost:3333/api

# Try it
curl -X POST http://localhost:3333/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{"channel":"EMAIL","recipient":"a@b.com","subject":"hi","body":"hello"}'

curl http://localhost:3333/api/notifications/<id>/status
```

Start the `notifications` server **before** the gateway — the gateway opens the
gRPC connection lazily, but the server needs to exist when the first call is
made.

## Adding a new RPC (checklist)

1. Add the `rpc` and its messages to `libs/shared/proto/notification.proto`.
2. Add matching interfaces + a method on `NotificationGrpc` in
   `libs/shared/src/lib/grpc/notification.types.ts`.
3. Implement it on the server with `@GrpcMethod(grpc.NOTIFICATION_SERVICE, 'YourMethod')`
   in `apps/notifications/src/app/notification.controller.ts`.
4. Call it from the gateway service via `this.notificationGrpc.yourMethod(...)`
   wrapped in `firstValueFrom`, and expose it over HTTP if needed.
5. Keep PascalCase in the proto / `@GrpcMethod` name, camelCase on the client
   interface.

## File map

| File | Responsibility |
| --- | --- |
| `libs/shared/proto/notification.proto` | The gRPC contract (source of truth) |
| `libs/shared/src/lib/grpc/notification.types.ts` | Hand-maintained TS types, exported as `grpc.*` |
| `libs/shared/src/index.ts` | Namespaces the gRPC types to avoid messaging collisions |
| `apps/notifications/src/main.ts` | Boots the gRPC **server** microservice |
| `apps/notifications/src/app/notification.controller.ts` | `@GrpcMethod` handlers |
| `apps/api-getway/src/app/notification/notification.module.ts` | Registers the gRPC **client** |
| `apps/api-getway/src/app/notification/notification.service.ts` | Wraps the client, `Observable` → `Promise` |
| `apps/api-getway/src/app/notification/notification.controller.ts` | REST endpoints that delegate to gRPC |
| `apps/*/webpack.config.js` | Copies the proto into `dist/proto/` at build time |
</content>
</invoke>
