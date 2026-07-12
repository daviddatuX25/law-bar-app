import subprocess, json, os

# Kill any old MCP server, then start fresh
os.system("pkill -f 'node mcp-server.js' 2>/dev/null; sleep 0.5")

decks = [
    "civil-law",
    "criminal-law", 
    "political-law",
    "commercial-law",
    "labor-law",
    "taxation",
    "legal-ethics",
    "remedial-law"
]

base_dir = "/home/user/Documents/LAW BAR/pipeline"
bar_dir = "/home/user/Documents/LAW BAR"

for subject_id in decks:
    md_path = f"{base_dir}/{subject_id}-shapes-triggers-flashcards.md"
    
    with open(md_path, 'r') as f:
        md = f.read()
    
    # Extract just the cards (skip frontmatter before first CARD line)
    lines = md.split('\n')
    cards_start = 0
    for i, line in enumerate(lines):
        if line.strip().startswith('CARD '):
            cards_start = i
            break
    cards_md = '\n'.join(lines[cards_start:])

    print(f"\n{'='*60}")
    print(f"Importing: {subject_id} ({len(cards_md)} chars)")
    
    # Start MCP server
    proc = subprocess.Popen(
        ['node', 'mcp-server.js'],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=bar_dir,
        env={**os.environ, 'DATABASE_PATH': f'{bar_dir}/bar_exam.db'}
    )

    def send_and_recv(req):
        msg = json.dumps(req).encode() + b'\n'
        proc.stdin.write(msg)
        proc.stdin.flush()
        # Read one line from stdout byte by byte
        line = b''
        while True:
            ch = proc.stdout.read(1)
            if ch == b'\n' or not ch:
                break
            line += ch
        return json.loads(line.decode())

    # Initialize
    try:
        resp = send_and_recv({"jsonrpc": "2.0", "id": "init", "method": "initialize"})
    except Exception as e:
        print(f"  Failed to init MCP: {e}")
        continue

    # Import
    resp = send_and_recv({
        "jsonrpc": "2.0", "id": "import", "method": "tools/call",
        "params": {
            "name": "import_subject_markdown",
            "arguments": {"subjectId": subject_id, "markdown": cards_md}
        }
    })
    if 'error' in resp:
        print(f"  ERROR: {resp['error']['message']}")
    else:
        print(f"  ✅ {resp['result']['content'][0]['text']}")

    # Verify
    resp = send_and_recv({
        "jsonrpc": "2.0", "id": "verify", "method": "tools/call",
        "params": {
            "name": "get_flashcard_deck",
            "arguments": {"subjectId": subject_id}
        }
    })
    if 'error' not in resp:
        deck = json.loads(resp['result']['content'][0]['text'])
        triggers = []
        try:
            resp_t = send_and_recv({
                "jsonrpc": "2.0", "id": "trig", "method": "tools/call",
                "params": {
                    "name": "get_trigger_words",
                    "arguments": {"subjectId": subject_id}
                }
            })
            if 'error' not in resp_t:
                triggers = json.loads(resp_t['result']['content'][0]['text'])
        except:
            pass
        print(f"  Cards: {len(deck)}, Triggers: {len(triggers)}")

    proc.terminate()
    proc.wait()

print(f"\n{'='*60}")
print("All imports complete!")
