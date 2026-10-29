package api

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"friday/backend/internal/ai"
	"friday/backend/internal/models"
)

const (
	toolListBoards  = "list_boards"
	toolGetBoard    = "get_board"
	toolSearchItems = "search_items"
	toolListPeople  = "list_people"
	toolCreateItem  = "create_item"
	toolUpdateItem  = "update_item"
)

type AgentProposalView struct {
	ID      primitive.ObjectID        `json:"id"`
	Type    string                    `json:"type"`
	Summary string                    `json:"summary"`
	Payload models.AgentActionPayload `json:"payload"`
}

type agentArgs struct {
	BoardID    string `json:"boardId"`
	GroupID    string `json:"groupId"`
	GroupName  string `json:"groupName"`
	ItemID     string `json:"itemId"`
	Name       string `json:"name"`
	Query      string `json:"query"`
	Status     string `json:"status"`
	Priority   string `json:"priority"`
	OwnerEmail string `json:"ownerEmail"`
	Date       string `json:"date"`
}

func objectSchema(properties map[string]any, required ...string) map[string]any {
	s := map[string]any{"type": "object", "properties": properties, "additionalProperties": false}
	if len(required) > 0 {
		s["required"] = required
	}
	return s
}

func agentTools() []ai.Tool {
	str := func(desc string) map[string]any { return map[string]any{"type": "string", "description": desc} }
	return []ai.Tool{
		{Type: "function", Function: ai.ToolFunction{Name: toolListBoards, Description: "List boards the current user can access in this workspace.", Parameters: objectSchema(map[string]any{})}},
		{Type: "function", Function: ai.ToolFunction{Name: toolGetBoard, Description: "Read a board: groups, columns, labels and items. Use this before answering questions about a board.", Parameters: objectSchema(map[string]any{"boardId": str("Board id. Omit to use the board currently open in the UI.")})}},
		{Type: "function", Function: ai.ToolFunction{Name: toolSearchItems, Description: "Search items by name across accessible boards in the workspace.", Parameters: objectSchema(map[string]any{"query": str("Text to search for."), "boardId": str("Optional board id to limit the search.")}, "query")}},
		{Type: "function", Function: ai.ToolFunction{Name: toolListPeople, Description: "List workspace members with names and emails. Use this to resolve owner email before proposing an item change.", Parameters: objectSchema(map[string]any{})}},
		{Type: "function", Function: ai.ToolFunction{Name: toolCreateItem, Description: "Propose creating an item. This does NOT run immediately; the user must approve it. Resolve groups and people first with get_board/list_people.", Parameters: objectSchema(map[string]any{
			"boardId": str("Board id. Omit to use the currently open board."), "groupName": str("Target group name. Omit to use the first group."),
			"name": str("Item name."), "status": str("Status label name, if known."), "priority": str("Priority label name, if known."),
			"ownerEmail": str("Workspace member email to assign as owner."), "date": str("Date in YYYY-MM-DD format."),
		}, "name")}},
		{Type: "function", Function: ai.ToolFunction{Name: toolUpdateItem, Description: "Propose updating an item. This does NOT run immediately; the user must approve it.", Parameters: objectSchema(map[string]any{
			"itemId": str("Item id."), "name": str("New item name."), "groupName": str("Move to this group."),
			"status": str("Status label name."), "priority": str("Priority label name."), "ownerEmail": str("Workspace member email."), "date": str("Date in YYYY-MM-DD format."),
		}, "itemId")}},
	}
}

func (s *Server) agentBoard(ctx context.Context, userID primitive.ObjectID, workspaceID primitive.ObjectID, boardIDArg string) (*models.Board, *boardAccess, error) {
	id, err := primitive.ObjectIDFromHex(strings.TrimSpace(boardIDArg))
	if err != nil {
		return nil, nil, fmt.Errorf("boardId is invalid or missing")
	}
	var board models.Board
	if err := s.db.Database.Collection("boards").FindOne(ctx, bson.M{"_id": id}).Decode(&board); err != nil {
		return nil, nil, fmt.Errorf("board not found")
	}
	if board.WorkspaceID != workspaceID {
		return nil, nil, fmt.Errorf("board is not in this workspace")
	}
	access, err := s.boardAccessFor(ctx, userID, &board)
	if err != nil {
		return nil, nil, err
	}
	if !access.CanRead {
		return nil, nil, fmt.Errorf("you do not have access to this board")
	}
	return &board, access, nil
}

func (s *Server) agentReadTool(ctx context.Context, user *models.User, workspaceID, currentBoardID primitive.ObjectID, name string, raw json.RawMessage) (any, error) {
	var args agentArgs
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &args); err != nil {
			return nil, fmt.Errorf("invalid arguments: %w", err)
		}
	}
	switch name {
	case toolListBoards:
		boards, err := s.accessibleBoards(ctx, user.ID, &workspaceID)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, b := range boards {
			out = append(out, map[string]any{"id": b.ID.Hex(), "name": b.Name, "visibility": b.Visibility})
		}
		return out, nil
	case toolGetBoard:
		boardID := args.BoardID
		if boardID == "" && currentBoardID != primitive.NilObjectID {
			boardID = currentBoardID.Hex()
		}
		board, _, err := s.agentBoard(ctx, user.ID, workspaceID, boardID)
		if err != nil {
			return nil, err
		}
		groups := []models.Group{}
		cur, err := s.db.Database.Collection("groups").Find(ctx, bson.M{"boardId": board.ID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}))
		if err != nil {
			return nil, err
		}
		_ = cur.All(ctx, &groups)
		items := []models.Item{}
		cur, err = s.db.Database.Collection("items").Find(ctx, bson.M{"boardId": board.ID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}).SetLimit(80))
		if err != nil {
			return nil, err
		}
		_ = cur.All(ctx, &items)
		return s.compactBoard(ctx, user.ID, board, groups, items)
	case toolSearchItems:
		q := strings.ToLower(strings.TrimSpace(args.Query))
		if q == "" {
			return []any{}, nil
		}
		boards, items, err := s.loadWorkspace(ctx, user.ID, &workspaceID)
		if err != nil {
			return nil, err
		}
		out := []map[string]any{}
		for _, it := range items {
			if len(out) >= 20 || !strings.Contains(strings.ToLower(it.Name), q) {
				continue
			}
			b := boards[it.BoardID]
			if b == nil {
				continue
			}
			out = append(out, s.compactItem(b, &it))
		}
		return out, nil
	case toolListPeople:
		members := []models.WorkspaceMember{}
		cur, err := s.workspaceMembers().Find(ctx, bson.M{"workspaceId": workspaceID})
		if err != nil {
			return nil, err
		}
		_ = cur.All(ctx, &members)
		userIDs := []primitive.ObjectID{}
		roleByID := map[primitive.ObjectID]string{}
		for _, m := range members {
			userIDs = append(userIDs, m.UserID)
			roleByID[m.UserID] = m.Role
		}
		users := []models.User{}
		cur, err = s.auth.Users().Find(ctx, bson.M{"_id": bson.M{"$in": userIDs}})
		if err != nil {
			return nil, err
		}
		_ = cur.All(ctx, &users)
		out := []map[string]any{}
		for _, u := range users {
			out = append(out, map[string]any{"id": u.ID.Hex(), "name": u.Name, "email": u.Email, "role": roleByID[u.ID]})
		}
		sort.Slice(out, func(i, j int) bool { return out[i]["name"].(string) < out[j]["name"].(string) })
		return out, nil
	default:
		return nil, fmt.Errorf("unknown read tool %q", name)
	}
}

func (s *Server) compactBoard(ctx context.Context, userID primitive.ObjectID, board *models.Board, groups []models.Group, items []models.Item) (map[string]any, error) {
	columns := []map[string]any{}
	for _, c := range board.Columns {
		labels := []map[string]string{}
		for _, l := range c.Labels {
			labels = append(labels, map[string]string{"id": l.ID, "name": l.Name})
		}
		columns = append(columns, map[string]any{"id": c.ID, "title": c.Title, "type": c.Type, "labels": labels})
	}
	groupMap := map[primitive.ObjectID]string{}
	for _, g := range groups {
		groupMap[g.ID] = g.Title
	}
	people := map[string]string{}
	wsMembers, _ := s.workspaceMembers().Find(ctx, bson.M{"workspaceId": board.WorkspaceID})
	if wsMembers != nil {
		var members []models.WorkspaceMember
		_ = wsMembers.All(ctx, &members)
		ids := []primitive.ObjectID{}
		for _, m := range members {
			ids = append(ids, m.UserID)
		}
		var users []models.User
		cur, _ := s.auth.Users().Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
		if cur != nil {
			_ = cur.All(ctx, &users)
		}
		for _, u := range users {
			people[u.ID.Hex()] = u.Name
		}
	}
	itemOut := []map[string]any{}
	for i := range items {
		display := map[string]any{}
		for _, c := range board.Columns {
			v, ok := items[i].Values[c.ID]
			if !ok {
				continue
			}
			switch c.Type {
			case "status", "priority":
				for _, l := range c.Labels {
					if l.ID == v {
						display[c.Title] = l.Name
					}
				}
			case "people":
				names := []string{}
				switch ids := v.(type) {
				case []string:
					for _, id := range ids {
						names = append(names, people[id])
					}
				case []any:
					for _, id := range ids {
						if str, ok := id.(string); ok {
							names = append(names, people[str])
						}
					}
				case primitive.A:
					for _, id := range ids {
						if str, ok := id.(string); ok {
							names = append(names, people[str])
						}
					}
				}
				display[c.Title] = names
			default:
				display[c.Title] = v
			}
		}
		itemOut = append(itemOut, map[string]any{
			"id": items[i].ID.Hex(), "name": items[i].Name, "group": groupMap[items[i].GroupID], "values": display,
		})
	}
	return map[string]any{
		"board": map[string]any{"id": board.ID.Hex(), "name": board.Name, "visibility": board.Visibility},
		"groups": func() []map[string]string {
			out := []map[string]string{}
			for _, g := range groups {
				out = append(out, map[string]string{"id": g.ID.Hex(), "name": g.Title})
			}
			return out
		}(),
		"columns": columns, "items": itemOut,
	}, nil
}

func (s *Server) compactItem(board *models.Board, item *models.Item) map[string]any {
	values := map[string]any{}
	for _, c := range board.Columns {
		v, ok := item.Values[c.ID]
		if !ok {
			continue
		}
		switch c.Type {
		case "status", "priority":
			for _, l := range c.Labels {
				if l.ID == v {
					values[c.Title] = l.Name
				}
			}
		case "people":
			values[c.Title] = itemPeopleIDs(item)
		default:
			values[c.Title] = v
		}
	}
	return map[string]any{"itemId": item.ID.Hex(), "name": item.Name, "boardId": board.ID.Hex(), "boardName": board.Name, "values": values}
}

func (s *Server) proposeAgentTool(ctx context.Context, user *models.User, workspaceID, currentBoardID primitive.ObjectID, name string, raw json.RawMessage) (*models.AgentAction, error) {
	var args agentArgs
	if err := json.Unmarshal(raw, &args); err != nil {
		return nil, fmt.Errorf("invalid arguments: %w", err)
	}
	boardIDArg := args.BoardID
	if boardIDArg == "" && currentBoardID != primitive.NilObjectID {
		boardIDArg = currentBoardID.Hex()
	}
	board, access, err := s.agentBoard(ctx, user.ID, workspaceID, boardIDArg)
	if err != nil {
		return nil, err
	}
	if !access.CanEdit {
		return nil, fmt.Errorf("you do not have edit permission on this board")
	}
	var payload models.AgentActionPayload
	var typ, summary string
	switch name {
	case toolCreateItem:
		itemName := strings.TrimSpace(args.Name)
		if itemName == "" {
			return nil, fmt.Errorf("item name is required")
		}
		group, err := s.resolveGroup(ctx, board, args.GroupID, args.GroupName)
		if err != nil {
			return nil, err
		}
		values, changes, err := s.resolveAgentValues(ctx, board, args)
		if err != nil {
			return nil, err
		}
		typ = "create_item"
		summary = fmt.Sprintf("Create “%s” in %s / %s", itemName, board.Name, group.Title)
		payload = models.AgentActionPayload{BoardID: board.ID, GroupID: group.ID, ItemName: itemName, Values: values, Changes: changes}
	case toolUpdateItem:
		itemID, err := primitive.ObjectIDFromHex(strings.TrimSpace(args.ItemID))
		if err != nil {
			return nil, fmt.Errorf("itemId is invalid")
		}
		var item models.Item
		if err := s.db.Database.Collection("items").FindOne(ctx, bson.M{"_id": itemID}).Decode(&item); err != nil {
			return nil, fmt.Errorf("item not found")
		}
		if item.BoardID != board.ID {
			return nil, fmt.Errorf("item is not on this board")
		}
		values, changes, err := s.resolveAgentValues(ctx, board, args)
		if err != nil {
			return nil, err
		}
		if strings.TrimSpace(args.Name) != "" {
			values["__name"] = strings.TrimSpace(args.Name)
			changes = append(changes, models.AgentChange{Field: "Name", Value: strings.TrimSpace(args.Name)})
		}
		if args.GroupName != "" || args.GroupID != "" {
			group, err := s.resolveGroup(ctx, board, args.GroupID, args.GroupName)
			if err != nil {
				return nil, err
			}
			payload.GroupID = group.ID
			changes = append(changes, models.AgentChange{Field: "Group", Value: group.Title})
		}
		if len(changes) == 0 {
			return nil, fmt.Errorf("no changes were specified")
		}
		typ = "update_item"
		summary = fmt.Sprintf("Update “%s” on %s", item.Name, board.Name)
		payload.BoardID = board.ID
		payload.ItemID = item.ID
		payload.ItemName = item.Name
		payload.Values = values
		payload.Changes = changes
	default:
		return nil, fmt.Errorf("unknown write tool %q", name)
	}
	now := time.Now()
	action := &models.AgentAction{
		ID: primitive.NewObjectID(), UserID: user.ID, WorkspaceID: workspaceID, BoardID: board.ID,
		Type: typ, Summary: summary, Payload: payload, Status: "pending", CreatedAt: now,
	}
	if _, err := s.db.Database.Collection("agent_actions").InsertOne(ctx, action); err != nil {
		return nil, err
	}
	return action, nil
}

func (s *Server) resolveGroup(ctx context.Context, board *models.Board, groupID, groupName string) (*models.Group, error) {
	if groupID != "" {
		id, err := primitive.ObjectIDFromHex(groupID)
		if err != nil {
			return nil, fmt.Errorf("groupId is invalid")
		}
		var g models.Group
		if err := s.db.Database.Collection("groups").FindOne(ctx, bson.M{"_id": id, "boardId": board.ID}).Decode(&g); err != nil {
			return nil, fmt.Errorf("group not found")
		}
		return &g, nil
	}
	groups := []models.Group{}
	cur, err := s.db.Database.Collection("groups").Find(ctx, bson.M{"boardId": board.ID}, options.Find().SetSort(bson.D{{Key: "position", Value: 1}}))
	if err != nil {
		return nil, err
	}
	_ = cur.All(ctx, &groups)
	if len(groups) == 0 {
		return nil, fmt.Errorf("board has no groups")
	}
	if groupName == "" {
		return &groups[0], nil
	}
	for i := range groups {
		if strings.EqualFold(groups[i].Title, strings.TrimSpace(groupName)) {
			return &groups[i], nil
		}
	}
	return nil, fmt.Errorf("group %q not found", groupName)
}

func (s *Server) resolveAgentValues(ctx context.Context, board *models.Board, args agentArgs) (map[string]any, []models.AgentChange, error) {
	values := map[string]any{}
	changes := []models.AgentChange{}
	if args.Status != "" {
		col := findColumn(board, "status")
		if col == nil {
			return nil, nil, fmt.Errorf("board has no status column")
		}
		label := findLabel(col, args.Status)
		if label == nil {
			return nil, nil, fmt.Errorf("status %q not found", args.Status)
		}
		values[col.ID] = label.ID
		changes = append(changes, models.AgentChange{Field: col.Title, Value: label.Name})
	}
	if args.Priority != "" {
		col := findColumn(board, "priority")
		if col == nil {
			return nil, nil, fmt.Errorf("board has no priority column")
		}
		label := findLabel(col, args.Priority)
		if label == nil {
			return nil, nil, fmt.Errorf("priority %q not found", args.Priority)
		}
		values[col.ID] = label.ID
		changes = append(changes, models.AgentChange{Field: col.Title, Value: label.Name})
	}
	if args.OwnerEmail != "" {
		col := findColumn(board, "people")
		if col == nil {
			return nil, nil, fmt.Errorf("board has no people column")
		}
		u, err := s.findWorkspaceUser(ctx, board.WorkspaceID, args.OwnerEmail)
		if err != nil {
			return nil, nil, err
		}
		values[col.ID] = []string{u.ID.Hex()}
		changes = append(changes, models.AgentChange{Field: col.Title, Value: u.Name})
	}
	if args.Date != "" {
		if _, err := time.Parse("2006-01-02", strings.TrimSpace(args.Date)); err != nil {
			return nil, nil, fmt.Errorf("date must be YYYY-MM-DD")
		}
		col := findDateColumn(board)
		if col == nil {
			return nil, nil, fmt.Errorf("board has no date column")
		}
		values[col.ID] = strings.TrimSpace(args.Date)
		changes = append(changes, models.AgentChange{Field: col.Title, Value: strings.TrimSpace(args.Date)})
	}
	return values, changes, nil
}

func findColumn(board *models.Board, typ string) *models.Column {
	for i := range board.Columns {
		if board.Columns[i].Type == typ {
			return &board.Columns[i]
		}
	}
	return nil
}

func findDateColumn(board *models.Board) *models.Column {
	for _, want := range []string{"due", "target", "end", "date"} {
		for i := range board.Columns {
			c := &board.Columns[i]
			if c.Type == "date" && strings.Contains(strings.ToLower(c.Title), want) {
				return c
			}
		}
	}
	return findColumn(board, "date")
}

func findLabel(col *models.Column, value string) *models.Label {
	for i := range col.Labels {
		l := &col.Labels[i]
		if strings.EqualFold(l.ID, value) || strings.EqualFold(l.Name, value) {
			return l
		}
	}
	return nil
}

func (s *Server) findWorkspaceUser(ctx context.Context, workspaceID primitive.ObjectID, emailOrName string) (*models.User, error) {
	members := []models.WorkspaceMember{}
	cur, err := s.workspaceMembers().Find(ctx, bson.M{"workspaceId": workspaceID})
	if err != nil {
		return nil, err
	}
	_ = cur.All(ctx, &members)
	ids := []primitive.ObjectID{}
	for _, m := range members {
		ids = append(ids, m.UserID)
	}
	users := []models.User{}
	cur, err = s.auth.Users().Find(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		return nil, err
	}
	_ = cur.All(ctx, &users)
	needle := strings.ToLower(strings.TrimSpace(emailOrName))
	for i := range users {
		if strings.ToLower(users[i].Email) == needle || strings.ToLower(users[i].Name) == needle {
			return &users[i], nil
		}
	}
	return nil, fmt.Errorf("workspace member %q not found", emailOrName)
}
