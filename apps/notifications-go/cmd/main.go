// apps/notifications-go/cmd/main.go
package main

import (
	"context"
	"log"
	"net"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	pb "pulse/notifications-go/gen/notification"
)

type server struct {
	pb.UnimplementedNotificationServiceServer
	db *pgxpool.Pool
}

func (s *server) Send(ctx context.Context, req *pb.SendRequest) (*pb.SendResponse, error) {
	if req.GetRecipient() == "" {
		return nil, status.Error(codes.InvalidArgument, "recipient is required")
	}
	log.Printf("[go] accepted SMS -> %s (id=%s)", req.GetRecipient(), req.GetId())
	go s.deliver(req) // ack fast, deliver async
	return &pb.SendResponse{Id: req.GetId(), Status: "ACCEPTED"}, nil
}

func (s *server) GetStatus(ctx context.Context, req *pb.GetStatusRequest) (*pb.GetStatusResponse, error) {
	var st string
	err := s.db.QueryRow(ctx, `SELECT status FROM notifications WHERE id=$1`, req.GetId()).Scan(&st)
	if err != nil {
		return nil, status.Error(codes.NotFound, "notification not found")
	}
	return &pb.GetStatusResponse{Id: req.GetId(), Status: st}, nil
}

func (s *server) deliver(req *pb.SendRequest) {
	time.Sleep(2 * time.Second) // call the real SMS provider here
	// update the SAME Postgres row the gateway created — coordinated only by the shared id
	_, err := s.db.Exec(context.Background(),
		`UPDATE notifications SET status='SENT' WHERE id=$1`, req.GetId())
	if err != nil {
		log.Printf("[go] failed to mark %s SENT: %v", req.GetId(), err)
		return
	}
	log.Printf("[go] marked %s SENT", req.GetId())
}

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("db: %v", err)
	}
	defer pool.Close()

	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = "4002"
	}
	lis, err := net.Listen("tcp", "0.0.0.0:"+port)
	if err != nil {
		log.Fatalf("listen: %v", err)
	}

	gs := grpc.NewServer()
	pb.RegisterNotificationServiceServer(gs, &server{db: pool})
	log.Printf("[go] notifications-go gRPC server on :%s", port)
	if err := gs.Serve(lis); err != nil {
		log.Fatalf("serve: %v", err)
	}
}
