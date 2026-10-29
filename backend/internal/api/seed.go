package api

import (
	"context"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/auth"
	"friday/backend/internal/models"
)

func (s *Server) Seed(ctx context.Context) error {
	if !s.cfg.SeedDemo {
		return nil
	}
	boardsCol := s.db.Database.Collection("boards")

	admin, err := s.ensureDemoUser(ctx, "admin@friday.dev", "Alex Morgan", "#6161ff")
	if err != nil {
		return err
	}
	maya, err := s.ensureDemoUser(ctx, "maya@friday.dev", "Maya Chen", "#00c875")
	if err != nil {
		return err
	}
	sam, err := s.ensureDemoUser(ctx, "sam@friday.dev", "Sam Rivera", "#fdab3d")
	if err != nil {
		return err
	}
	jordan, err := s.ensureDemoUser(ctx, "jordan@friday.dev", "Jordan Lee", "#e2445c")
	if err != nil {
		return err
	}
	priya, err := s.ensureDemoUser(ctx, "priya@friday.dev", "Priya Patel", "#579bfc")
	if err != nil {
		return err
	}

	workspace, err := s.ensureDefaultWorkspace(ctx)
	if err != nil {
		return err
	}

	count, err := boardsCol.CountDocuments(ctx, bson.M{})
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	now := time.Now()
	day := func(n int) string { return now.AddDate(0, 0, n).Format("2006-01-02") }

	// ---------- Product roadmap ----------
	roadmap, groups, err := s.createBoardDoc(ctx, admin, workspace.ID, "Product Roadmap", "#6161ff", "🗺️", "roadmap")
	if err != nil {
		return err
	}
	roadmap.Description = "What we are building next and why. Updated weekly by the product team."
	_, _ = boardsCol.UpdateOne(ctx, bson.M{"_id": roadmap.ID}, bson.M{"$set": bson.M{"description": roadmap.Description}})
	groupByName := map[string]models.Group{}
	for _, g := range groups {
		groupByName[g.Title] = g
	}
	addItem := func(g models.Group, name string, stage, owner, priority, start, target, notes string) {
		pos := float64(1024)
		var last []models.Item
		cur, _ := s.db.Database.Collection("items").Find(ctx, bson.M{"groupId": g.ID}, optionsSortPosDesc())
		if cur != nil {
			_ = cur.All(ctx, &last)
		}
		if len(last) > 0 {
			pos = last[0].Position + 1024
		}
		values := map[string]any{
			"stage":    stage,
			"priority": priority,
			"start":    start,
			"target":   target,
			"notes":    notes,
		}
		if owner != "" {
			values["people_owner"] = []string{owner}
		}
		it := models.Item{
			ID:        primitive.NewObjectID(),
			BoardID:   roadmap.ID,
			GroupID:   g.ID,
			Name:      name,
			Position:  pos,
			Values:    values,
			CreatedBy: admin.ID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		_, _ = s.db.Database.Collection("items").InsertOne(ctx, it)
		s.logActivity(ctx, roadmap.ID, it.ID, admin, "created item", it.Name, "")
	}
	addItem(groupByName["Now"], "AI-powered feature insights", "now", maya.ID.Hex(), "critical", day(-4), day(9), "Surface blockers and risks automatically from board activity.")
	addItem(groupByName["Now"], "Slack notifications for mentions", "now", sam.ID.Hex(), "high", day(1), day(14), "Notify people when they are mentioned in an update.")
	addItem(groupByName["Now"], "Public API v2", "now", admin.ID.Hex(), "high", day(3), day(20), "Ship scoped personal access tokens and a cleaner REST surface.")
	addItem(groupByName["Next"], "Workload heatmap", "next", priya.ID.Hex(), "medium", day(22), day(35), "Visualize capacity across the product team.")
	addItem(groupByName["Next"], "SSO & SCIM provisioning", "next", jordan.ID.Hex(), "high", day(26), day(40), "Enterprise-ready identity management.")
	addItem(groupByName["Next"], "Custom automation recipes", "next", sam.ID.Hex(), "medium", day(32), day(48), "When status changes, then notify a channel.")
	addItem(groupByName["Later"], "Mobile app refresh", "later", maya.ID.Hex(), "low", day(70), day(90), "A faster, offline-friendly mobile experience.")
	addItem(groupByName["Later"], "Portfolio dashboards", "later", priya.ID.Hex(), "low", day(85), day(110), "Roll up delivery health across every team.")

	// ---------- Marketing launch ----------
	marketing, mgroups, err := s.createBoardDoc(ctx, admin, workspace.ID, "Marketing Launch", "#00c875", "📣", "project")
	if err != nil {
		return err
	}
	marketing.Description = "Everything needed for the fall launch: content, campaigns and partnerships."
	_, _ = boardsCol.UpdateOne(ctx, bson.M{"_id": marketing.ID}, bson.M{"$set": bson.M{"description": marketing.Description}})
	mg := map[string]models.Group{}
	for _, g := range mgroups {
		mg[g.Title] = g
	}
	addMarketing := func(g models.Group, name, status, owner, priority, start, due string, effort float64, approved bool) {
		values := map[string]any{
			"status":   status,
			"priority": priority,
			"start":    start,
			"due":      due,
			"effort":   effort,
			"approved": approved,
		}
		if owner != "" {
			values["people_owner"] = []string{owner}
		}
		pos := float64(1024)
		var last []models.Item
		cur, _ := s.db.Database.Collection("items").Find(ctx, bson.M{"groupId": g.ID}, optionsSortPosDesc())
		if cur != nil {
			_ = cur.All(ctx, &last)
		}
		if len(last) > 0 {
			pos = last[0].Position + 1024
		}
		it := models.Item{
			ID:        primitive.NewObjectID(),
			BoardID:   marketing.ID,
			GroupID:   g.ID,
			Name:      name,
			Position:  pos,
			Values:    values,
			CreatedBy: admin.ID,
			CreatedAt: now,
			UpdatedAt: now,
		}
		_, _ = s.db.Database.Collection("items").InsertOne(ctx, it)
		s.logActivity(ctx, marketing.ID, it.ID, admin, "created item", it.Name, "")
	}
	addMarketing(mg["To do"], "Press kit & media list", "backlog", priya.ID.Hex(), "medium", day(2), day(8), 5, false)
	addMarketing(mg["To do"], "Customer story: Northwind", "backlog", maya.ID.Hex(), "low", day(4), day(12), 3, false)
	addMarketing(mg["In progress"], "Landing page copy", "working", admin.ID.Hex(), "high", day(-4), day(3), 5, true)
	addMarketing(mg["In progress"], "Launch teaser video", "working", sam.ID.Hex(), "critical", day(-2), day(5), 8, false)
	addMarketing(mg["In progress"], "Email nurture sequence", "review", jordan.ID.Hex(), "high", day(-1), day(4), 5, true)
	addMarketing(mg["Done"], "Brand guidelines refresh", "done", maya.ID.Hex(), "medium", day(-10), day(-2), 8, true)
	addMarketing(mg["Done"], "Partner announcement list", "done", sam.ID.Hex(), "low", day(-3), day(-1), 2, true)

	// A couple of comments make the demo feel lived-in.
	var aiItem models.Item
	if err := s.db.Database.Collection("items").FindOne(ctx, bson.M{"boardId": roadmap.ID, "name": "AI-powered feature insights"}).Decode(&aiItem); err == nil {
		_ = s.addSeedComment(ctx, &aiItem, maya, "I pulled the latest research into the notes — worth a read before Thursday.")
		_ = s.addSeedComment(ctx, &aiItem, admin, "Thanks Maya. Let's scope the first iteration in this week's planning.")
	}

	slog.Info("demo workspace seeded",
		"admin", "admin@friday.dev",
		"password", "friday123",
		"boards", 2,
	)
	return nil
}

func (s *Server) ensureDemoUser(ctx context.Context, email, name, color string) (*models.User, error) {
	u, err := s.auth.FindUserByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if u != nil {
		return u, nil
	}
	hash, err := auth.HashPassword("friday123")
	if err != nil {
		return nil, err
	}
	now := time.Now()
	u = &models.User{
		ID:           primitive.NewObjectID(),
		Email:        email,
		Name:         name,
		AvatarColor:  color,
		PasswordHash: hash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	if _, err := s.auth.Users().InsertOne(ctx, *u); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			return s.auth.FindUserByEmail(ctx, email)
		}
		return nil, err
	}
	return u, nil
}

func (s *Server) addSeedComment(ctx context.Context, item *models.Item, author *models.User, body string) error {
	c := models.Comment{
		ID:          primitive.NewObjectID(),
		ItemID:      item.ID,
		BoardID:     item.BoardID,
		UserID:      author.ID,
		AuthorName:  author.Name,
		AuthorColor: author.AvatarColor,
		Body:        body,
		CreatedAt:   time.Now().Add(-2 * time.Hour),
	}
	_, err := s.db.Database.Collection("comments").InsertOne(ctx, c)
	return err
}

func optionsSortPosDesc() *options.FindOptions {
	return options.Find().SetSort(bson.D{{Key: "position", Value: -1}}).SetLimit(1)
}
