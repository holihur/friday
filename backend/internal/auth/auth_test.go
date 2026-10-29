package auth

import "testing"

func TestHasScope(t *testing.T) {
	cases := []struct {
		name   string
		scopes []string
		needed string
		want   bool
	}{
		{"exact", []string{"boards:read"}, "boards:read", true},
		{"wildcard", []string{"*"}, "boards:write", true},
		{"write implies read", []string{"boards:write"}, "boards:read", true},
		{"read does not imply write", []string{"boards:read"}, "boards:write", false},
		{"different resource", []string{"items:write"}, "boards:read", false},
		{"users read", []string{"users:read"}, "users:read", true},
		{"empty", nil, "boards:read", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := HasScope(tc.scopes, tc.needed); got != tc.want {
				t.Fatalf("HasScope(%v, %q) = %v, want %v", tc.scopes, tc.needed, got, tc.want)
			}
		})
	}
}

func TestValidScope(t *testing.T) {
	if !ValidScope("items:write") {
		t.Fatal("items:write should be a valid scope")
	}
	if ValidScope("admin:everything") {
		t.Fatal("unknown scope must be rejected")
	}
}
