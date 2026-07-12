import subprocess, json, os, sys

# Read the deck markdown
with open("pipeline/civil-law-shapes-triggers-flashcards.md", "r") as f:
    md = f.read()

# Extract just the cards (skip frontmatter before the first CARD line)
lines = md.split('\n')
cards_start = 0
for i, line in enumerate(lines):
    if line.strip().startswith('CARD '):
        cards_start = i
        break
cards_md = '\n'.join(lines[cards_start:])

print(f"Cards markdown length: {len(cards_md)} chars")

# Start MCP server
proc = subprocess.Popen(
    ['node', 'mcp-server.js'],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env={**os.environ, 'DATABASE_PATH': './bar_exam.db'}
)

def send_and_recv(req):
    """Send JSON-RPC request and receive one response line"""
    msg = json.dumps(req).encode() + b'\n'
    proc.stdin.write(msg)
    proc.stdin.flush()
    # Read one line from stdout
    line = b''
    while True:
        ch = proc.stdout.read(1)
        if ch == b'\n' or not ch:
            break
        line += ch
    return json.loads(line.decode())

# 1. Initialize
resp = send_and_recv({"jsonrpc": "2.0", "id": "init-1", "method": "initialize"})
print(f"Server: {resp['result']['serverInfo']['name']} v{resp['result']['serverInfo']['version']}")

# 2. Import
print("Importing through MCP...")
resp = send_and_recv({
    "jsonrpc": "2.0", "id": "import-1", "method": "tools/call",
    "params": {
        "name": "import_subject_markdown",
        "arguments": {"subjectId": "civil-law", "markdown": cards_md}
    }
})
if 'error' in resp:
    print(f"MCP Error: {resp['error']}")
else:
    print(f"Success: {resp['result']['content'][0]['text']}")

# 3. Verify
resp = send_and_recv({
    "jsonrpc": "2.0", "id": "deck-1", "method": "tools/call",
    "params": {
        "name": "get_flashcard_deck",
        "arguments": {"subjectId": "civil-law"}
    }
})
if 'error' in resp:
    print(f"Error: {resp['error']}")
else:
    deck = json.loads(resp['result']['content'][0]['text'])
    print(f"\nFlashcards imported: {len(deck)}")
    for c in deck:
        triggers = ', '.join(c.get('front_triggers', [])[:3])
        print(f"  [{c['id']}] {c['front_shape'][:55]}... triggers: {triggers}")

# 4. Verify decoy pairs
resp = send_and_recv({
    "jsonrpc": "2.0", "id": "decoy-1", "method": "tools/call",
    "params": {
        "name": "get_decoy_pairs",
        "arguments": {"subjectId": "civil-law"}
    }
})
if 'error' not in resp:
    decoys = json.loads(resp['result']['content'][0]['text'])
    print(f"\nDecoy pairs: {len(decoys)}")
    for d in decoys:
        print(f"  [{d['id']}] Shared trigger: {d['shared_trigger']}")

proc.terminate()
proc.wait()
print("\nMCP import complete!")
