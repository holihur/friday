package secret

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i)
	}
	for _, plain := range []string{"sk-test-123456", "hello 世界", "a"} {
		enc, err := Encrypt(key, plain)
		if err != nil {
			t.Fatal(err)
		}
		if enc == plain {
			t.Fatal("ciphertext must differ from plaintext")
		}
		got, err := Decrypt(key, enc)
		if err != nil {
			t.Fatal(err)
		}
		if got != plain {
			t.Fatalf("got %q, want %q", got, plain)
		}
	}
}

func TestDecryptWithWrongKey(t *testing.T) {
	key1 := make([]byte, 32)
	key2 := make([]byte, 32)
	key2[0] = 1
	enc, err := Encrypt(key1, "secret")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := Decrypt(key2, enc); err == nil {
		t.Fatal("decrypt with wrong key must fail")
	}
}
