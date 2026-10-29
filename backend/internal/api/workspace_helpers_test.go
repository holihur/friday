package api

import "testing"

func TestWorkspaceRank(t *testing.T) {
	if workspaceRank(WorkspaceRoleOwner) <= workspaceRank(WorkspaceRoleAdmin) {
		t.Fatal("owner must outrank admin")
	}
	if workspaceRank(WorkspaceRoleAdmin) <= workspaceRank(WorkspaceRoleMember) {
		t.Fatal("admin must outrank member")
	}
	if workspaceRank(WorkspaceRoleMember) <= workspaceRank(WorkspaceRoleGuest) {
		t.Fatal("member must outrank guest")
	}
	if workspaceRank("unknown") != 0 {
		t.Fatal("unknown roles have no rank")
	}
}

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Acme Product":      "acme-product",
		"  设计 团队  ":         "设计-团队",
		"---":               "workspace",
		"Hello, World! 123": "hello-world-123",
	}
	for input, want := range cases {
		if got := slugify(input); got != want {
			t.Fatalf("slugify(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestInviteTokensAreUniqueAndHashed(t *testing.T) {
	raw1, hash1 := newInviteToken()
	raw2, hash2 := newInviteToken()
	if raw1 == raw2 || hash1 == hash2 {
		t.Fatal("invite tokens must be unique")
	}
	if hashInviteToken(raw1) != hash1 {
		t.Fatal("hashInviteToken must be deterministic")
	}
	if len(raw1) < 30 || len(hash1) != 64 {
		t.Fatalf("unexpected token lengths: %d / %d", len(raw1), len(hash1))
	}
}
