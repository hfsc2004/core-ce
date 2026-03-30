#!/usr/bin/env python3
# @version 1.1.3 - March 5, 2026
# @copyright 2026 Pseudo SF
"""
MOJIBAKE FIXER - Python version
Fixes UTF-8 corruption (double-encoded text)
"""

import sys
import os

# Patterns: (corrupted_hex, correct_char)
PATTERNS = [
    # Warning symbols  
    ("c3a2c5a1c2a0c3afc2b8c28f", "\u26a0\ufe0f"),  # âš ï¸
    ("c3a2c5a1c2a0", "\u26a0"),                     # âš 
    ("c3a2c5a1c2a1", "\u26a1"),                     # âš¡
    ("c3a2c593c294", "\u2714"),                     # âœ”
    ("c3a2c593c297", "\u2717"),                     # âœ—
    ("c3a2c28c", "\u274c"),                         # âŒ

    # NEW patterns - Round 4 (user-reported batch)
    ("c3b0c5b8e2809cc2a5", "\U0001F4E5"),           # 📥 inbox tray
    ("c3b0c5b8e280bac2a0c3afc2b8c28f", "\U0001F6E0\ufe0f"), # 🛠️ hammer/wrench (fixed)
    ("c3b0c5b8e2809dc2a2", "\U0001F522"),           # 🔢 input numbers (fixed)
    ("c3b0c5b8e2809cc5a0", "\U0001F4CA"),           # 📊 bar chart (alternate)
    ("c3b0c5b8c2a6e284a2", "\U0001F999"),           # 🦙 llama
    ("c3b0c5b8c5bdc2a8", "\U0001F3A8"),             # 🎨 artist palette
    # NEW patterns - Round 4.2 (ISO-8859-1 based encodings)
    ("c3b0c29fc294c2a2", "\U0001F522"),             # 🔢 input numbers (ISO)
    ("c3a2c5bee280a2", "\u2795"),                   # ➕ plus sign (CP1252)
    ("c3a2c29ec295", "\u2795"),                     # ➕ plus sign (ISO)
    ("c3b0c5b8e2809ce2809a", "\U0001F4C2"),         # 📂 open folder (CP1252)
    ("c3b0c29fc293c282", "\U0001F4C2"),             # 📂 open folder (ISO)
    # NEW patterns - Round 5 (user-reported batch)
    ("c3b0c5b8c2a4e28094", "\U0001F917"),           # 🤗 hugging face (fixed)
    ("c3a2e2809ec2b9c3afc2b8c28f", "\u2139\ufe0f"), # ℹ️ information (CP1252)
    ("c3a2c284c2b9c3afc2b8c28f", "\u2139\ufe0f"),   # ℹ️ information (ISO)
    ("c3b0c5b8e28098c281c3afc2b8c28f", "\U0001F441\ufe0f"), # 👁️ eye
    ("c3b0c5b8e284a2cb86", "\U0001F648"),           # 🙈 see-no-evil monkey
    # NEW patterns - Round 6 (with undefined CP1252 bytes)
    ("c3b0c5b8e2809dc28d", "\U0001F50D"),           # 🔍 magnifying glass
    ("c3a2c593c28fc3afc2b8c28f", "\u270F\ufe0f"), # ✏️ pencil
    ("c3a2c29dc592", "\u274C"),                     # ❌ cross mark (alt)
    # NEW patterns - Round 7
    ("c3b0c5b8e28093c2a5c3afc2b8c28f", "\U0001F5A5\ufe0f"), # 🖥️ desktop computer
    ("c3b0c5b8e2809cc5a1", "\U0001F4DA"),           # 📚 books
    ("c3b0c5b8e2809cc29d", "\U0001F4DD"),           # 📝 memo
    # NEW patterns - Round 8
    ("c3a2e2809dc281", "\u2501"),                         # ━ heavy horizontal line
    ("c3a2e2809dc281c3a2e2809dc281c3a2e2809dc281", "\u2501\u2501\u2501"), # ━━━ triple line
    ("c3a2c2adc290", "\u2B50"),                           # ⭐ star
    # NEW patterns - Round 9
    ("c3a2e28094c28f", "\u25CF"),                         # ● black circle
    ("c3a2e280a0e28099", "\u2192"),                       # → right arrow (alt)
    ("c3b0c5b8e28098c2a4", "\U0001F464"),                 # 👤 bust silhouette
    ("c3b0c5b8c5bde280bac3afc2b8c28f", "\U0001F39B\ufe0f"), # 🎛️ control knobs






    ("c3b0c5b8e2809cc2a6", "\U0001F4E6"),           # 📦 package (alternate)
    ("c3b0c5b8c5a1e282ac", "\U0001F680"),           # 🚀 rocket (with euro)
    ("c3a2e280a0c290", "\u2190"),                   # ← left arrow (alternate)
    ("c3b0c5b8c290c28d", "\U0001F40D"),             # 🐍 snake
    ("c3b0c5b8c2a4e28093", "\U0001F916"),           # 🤖 robot
    ("c3a2c593e2809c", "\u2713"),                   # ✓ check mark
    ("c3b0c5b8e2809cc281", "\U0001F4C1"),           # 📁 folder
    ("c3b0c5b8c592c290", "\U0001F310"),             # 🌐 globe
    ("c3b0c5b8e2809ce2809e", "\U0001F4C4"),         # 📄 document
    ("c3a2c5a1e28093c3afc2b8c28f", "\u2696\ufe0f"), # ⚖️ scales
    ("c3b0c5b8e2809de28094", "\U0001F517"),         # 🔗 link
    ("c3a2c28fc2b3", "\u23F3"),                     # ⏳ hourglass

    
    # NEW patterns - Round 3
    ("c3a2c5a1e284a2c3afc2b8c28f", "\u2699\ufe0f"), # âš™ï¸ gear (line 498)
    ("c3b0c5b8e28099c2be", "\U0001F4BE"),           # ðŸ’¾ floppy (line 1048)
    ("c3b0c5b8e28094e28098c3afc2b8c28f", "\U0001F5D1\ufe0f"), # ðŸ—‘ï¸ wastebasket (line 1093)
    ("c3a2e282acc2a2", "\u2022"),                   # â€¢ bullet (line 1068)
    
    # Round 2 patterns
    ("c3b0c5b8e2809ce280b9", "\U0001F4CB"),         # ðŸ“‹ clipboard (line 366)
    ("c383c2a2c3a2e2809ac2acc382c2a2", "\u2022"),   # â€¢ bullet (line 374)
    ("c3b0c5b8e2809de2809e", "\U0001F504"),         # ðŸ”„ refresh (line 445)
    ("c3a2c593e280a6", "\u2705"),                   # âœ… checkmark (line 647)
    
    # Arrows
    ("c3a2c286c290", "\u2190"),                     # â†
    ("c3a2c286c292", "\u2192"),                     # â†’
    
    # Round 1 emojis
    ("c3b0c5b8c5bdc2ae", "\U0001F3AE"),             # ðŸŽ® (line 216)
    ("c3b0c5b8c28dc5bd", "\U0001F34E"),             # ðŸŽ (line 219) 
    ("c3b0c5b8c2a7c2a0", "\U0001F9E0"),             # ðŸ§  (line 222)
    ("c3b0c5b8e28099c2bb", "\U0001F4BB"),           # ðŸ’» (line 231)
    
    # More common emoji patterns
    ("c3b0c5b8c593c281", "\U0001F4C1"),             # ðŸ“
    ("c3b0c5b8c593c282", "\U0001F4C2"),             # ðŸ“‚
    ("c3b0c5b8c593c29d", "\U0001F4DD"),             # ðŸ“
    ("c3b0c5b8c593c28b", "\U0001F4CB"),             # ðŸ“‹ (alternate)
    ("c3b0c5b8c593c28a", "\U0001F4CA"),             # ðŸ“Š
    ("c3b0c5b8c593c2a6", "\U0001F4E6"),             # ðŸ“¦
    ("c3b0c5b8c593c2b7", "\U0001F4F7"),             # ðŸ“·
    ("c3b0c5b8c592c2bb", "\U0001F4BB"),             # ðŸ’» (alternate)
    ("c3b0c5b8c594c28d", "\U0001F50D"),             # ðŸ”
    ("c3b0c5b8c594c2a7", "\U0001F527"),             # ðŸ”§
    ("c3b0c5b8c594c297", "\U0001F517"),             # ðŸ”—
    ("c3b0c5b8c594c284", "\U0001F504"),             # ðŸ”„ (alternate)
    ("c3b0c5b8c593c2a1", "\U0001F4E1"),             # ðŸ“¡
    ("c3a2c5a1c299", "\u2699"),                     # âš™
    ("c3b0c5b8c5a1c2a0", "\U0001F680"),             # ðŸš€
    
    # Punctuation
    ("c3a2c280c294", "\u2014"),                     # â€”
    ("c3a2c280c299", "\u2019"),                     # '
    ("c3a2c280c29c", "\u201c"),                     # "
    ("c3a2c280c29d", "\u201d"),                     # "
    ("c3a2c280c2a2", "\u2022"),                     # â€¢ (alternate)
    
    # Copyright
    ("c382c2a9", "\u00a9"),                         # Â©
    ("c382c2ae", "\u00ae"),                         # Â®
    
    # Space
    ("c382c2a0", " "),                              # NBSP
]

def build_replacements():
    """Convert hex patterns to actual strings"""
    result = []
    for hex_pattern, correct in PATTERNS:
        try:
            corrupted = bytes.fromhex(hex_pattern).decode('utf-8')
            result.append((corrupted, correct))
        except Exception as e:
            print(f"Warning: Could not decode {hex_pattern}: {e}")
    return result

def fix_content(content):
    """Fix mojibake in content"""
    fixed = content
    total = 0
    replacements = build_replacements()
    
    # Sort by length (longest first)
    replacements.sort(key=lambda x: len(x[0]), reverse=True)
    
    for corrupted, correct in replacements:
        if corrupted in fixed:
            count = fixed.count(corrupted)
            fixed = fixed.replace(corrupted, correct)
            total += count
            print(f"  Replaced {count}x: {repr(corrupted)[:30]} -> {correct}")
    
    return fixed, total

def scan_content(content):
    """Scan for mojibake patterns"""
    replacements = build_replacements()
    found = []
    
    lines = content.split('\n')
    for i, line in enumerate(lines, 1):
        for corrupted, correct in replacements:
            if corrupted in line:
                found.append((i, repr(corrupted)[:30], correct))
    
    return found

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 fix-mojibake.py <file> [--dry-run]")
        print("       python3 fix-mojibake.py scan <file>")
        sys.exit(1)
    
    if sys.argv[1] == 'scan':
        filepath = sys.argv[2] if len(sys.argv) > 2 else None
        if not filepath:
            print("Usage: python3 fix-mojibake.py scan <file>")
            sys.exit(1)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        found = scan_content(content)
        print(f"Scanning: {filepath}")
        print(f"Found {len(found)} issue(s)")
        seen = set()
        for line, corrupted, correct in found:
            key = corrupted
            if key not in seen:
                print(f"  Line {line}: {corrupted} -> {correct}")
                seen.add(key)
        sys.exit(0)
    
    filepath = sys.argv[1]
    dry_run = '--dry-run' in sys.argv
    
    print(f"Mojibake Fixer - {'DRY RUN' if dry_run else 'FIX'}")
    print(f"File: {filepath}\n")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    fixed, count = fix_content(content)
    
    print(f"\nTotal fixed: {count} pattern(s)")
    
    if count > 0 and not dry_run:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(fixed)
        print("Saved!")
    elif dry_run:
        print("(dry run - no changes saved)")
    
    print("Done!")

if __name__ == '__main__':
    main()
