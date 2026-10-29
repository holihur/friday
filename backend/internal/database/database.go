package database

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/config"
)

type DB struct {
	Client   *mongo.Client
	Database *mongo.Database
}

func Connect(ctx context.Context, cfg *config.Config) (*DB, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(cfg.MongoURI))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	db := &DB{Client: client, Database: client.Database(cfg.MongoDB)}
	if err := db.ensureIndexes(ctx); err != nil {
		return nil, err
	}
	return db, nil
}

func (d *DB) Close(ctx context.Context) error { return d.Client.Disconnect(ctx) }

func (d *DB) ensureIndexes(ctx context.Context) error {
	userAIConfigs := d.Database.Collection("user_ai_configs")
	_, err := userAIConfigs.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "userId", Value: 1}}, Options: options.Index().SetUnique(true)})
	if err != nil {
		return err
	}

	agentActions := d.Database.Collection("agent_actions")
	_, err = agentActions.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "status", Value: 1}}},
	})
	if err != nil {
		return err
	}

	users := d.Database.Collection("users")
	_, err = users.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "email", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "oidcIssuer", Value: 1}, {Key: "oidcSubject", Value: 1}}, Options: options.Index().SetName("oidc_identity")},
	})
	if err != nil {
		return err
	}

	sessions := d.Database.Collection("sessions")
	_, err = sessions.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
	})
	if err != nil {
		return err
	}

	passwordResets := d.Database.Collection("password_reset_tokens")
	_, err = passwordResets.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
	})
	if err != nil {
		return err
	}

	challenges := d.Database.Collection("login_challenges")
	_, err = challenges.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
	})
	if err != nil {
		return err
	}

	pats := d.Database.Collection("personal_access_tokens")
	_, err = pats.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}}},
	})
	if err != nil {
		return err
	}

	workspaces := d.Database.Collection("workspaces")
	_, err = workspaces.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "slug", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "ownerId", Value: 1}}},
	})
	if err != nil {
		return err
	}

	workspaceMembers := d.Database.Collection("workspace_members")
	_, err = workspaceMembers.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "userId", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}}},
	})
	if err != nil {
		return err
	}

	invitations := d.Database.Collection("invitations")
	_, err = invitations.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "tokenHash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "email", Value: 1}}},
		{Keys: bson.D{{Key: "expiresAt", Value: 1}}, Options: options.Index().SetExpireAfterSeconds(0)},
	})
	if err != nil {
		return err
	}

	boards := d.Database.Collection("boards")
	_, err = boards.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "updatedAt", Value: -1}}},
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "updatedAt", Value: -1}}},
	})
	if err != nil {
		return err
	}

	groups := d.Database.Collection("groups")
	_, err = groups.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "boardId", Value: 1}, {Key: "position", Value: 1}}})
	if err != nil {
		return err
	}

	items := d.Database.Collection("items")
	_, err = items.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "boardId", Value: 1}, {Key: "groupId", Value: 1}, {Key: "position", Value: 1}}},
		{Keys: bson.D{{Key: "name", Value: "text"}}},
	})
	if err != nil {
		return err
	}

	comments := d.Database.Collection("comments")
	_, err = comments.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "itemId", Value: 1}, {Key: "createdAt", Value: 1}}})
	if err != nil {
		return err
	}

	activity := d.Database.Collection("activities")
	_, err = activity.Indexes().CreateOne(ctx, mongo.IndexModel{Keys: bson.D{{Key: "boardId", Value: 1}, {Key: "createdAt", Value: -1}}})
	return err
}
