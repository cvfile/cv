package cv

import "testing"

func TestMajorVersion(t *testing.T) {
	cases := []struct {
		in        string
		wantMajor int
		wantOK    bool
	}{
		{"0.1", 0, true},
		{"1.0", 1, true},
		{"2.0", 2, true},
		{"10.3", 10, true},
		{"3", 3, true},
		{"", 0, false},
		{"x.y", 0, false},
	}
	for _, c := range cases {
		major, ok := majorVersion(c.in)
		if ok != c.wantOK || major != c.wantMajor {
			t.Errorf("majorVersion(%q) = (%d, %t), want (%d, %t)", c.in, major, ok, c.wantMajor, c.wantOK)
		}
	}
}

// TestNewerFormatVersionThreshold confirms the warning fires only for majors the
// SDK was not built for: 0.x and 1.0 are known, major >= 2 is newer.
func TestNewerFormatVersionThreshold(t *testing.T) {
	for _, v := range []string{"0.1", "1.0"} {
		if major, ok := majorVersion(v); ok && major > knownMaxMajor {
			t.Errorf("version %q should be treated as known (major %d <= %d)", v, major, knownMaxMajor)
		}
	}
	if major, ok := majorVersion("2.0"); !ok || major <= knownMaxMajor {
		t.Errorf("version 2.0 should be flagged as newer (major %d > %d)", major, knownMaxMajor)
	}
}
