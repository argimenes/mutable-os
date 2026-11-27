"""Compare only identified passages with independent, pinned publisher/author text."""
import difflib
import json
from pathlib import Path
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
ACL = 'https://raw.githubusercontent.com/acl-org/acl-anthology/373054444ad4af794277b0608ffad335814cf1f6/data/xml/'
JOSS = 'https://raw.githubusercontent.com/dfm/corner.py/88054ae759391ad463fd6fdec557999d34638f8e/paper/paper.md'


def tokens(text):
    text = unicodedata.normalize('NFKC', text).casefold()
    return re.findall(r"[^\W_]+|[^\w\s]", text)


def compare(id, url):
    data = subprocess.check_output(['curl', '--fail', '--silent', '--show-error', '--location', url]).decode()
    native = json.loads((ROOT / 'generated' / (id + '.ink')).read_text())['document']
    blocks = {b['id']: b for b in native['blocks']}
    first = blocks[blocks[native['root']['target']['blockId']]['children'][0]['target']['blockId']]
    texts = [''.join(a['text'] for a in b['inline']) for edge in first['children']
             if (b := blocks[edge['target']['blockId']]).get('inline')]
    if id == 'corner':
        expected = data.split('# Summary', 1)[1].strip().split('\n\n', 1)[0]
        expected = expected.replace('[@matplotlib]', '(Hunter 2007)').replace('*', '')
        actual = next(t for t in texts if t.startswith('This Python module'))
    else:
        prefix = 'We introduce a new language representation' if id == 'bert' else 'Authorship attribution typically'
        expected = next(''.join(a.itertext()) for a in ET.fromstring(data).iter('abstract')
                        if ''.join(a.itertext()).startswith(prefix))
        actual = ' '.join(texts[texts.index('Abstract') + 1:texts.index('1 Introduction')])
    a, b = tokens(expected), tokens(actual)
    diffs = [dict(operation=op, reference=' '.join(a[i:j]), reconstructed=' '.join(b[k:l]))
             for op, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes() if op != 'equal']
    return dict(paper=id, reference=url, referenceTokens=len(a), reconstructedTokens=len(b),
                exactTokenSequence=a == b, differences=diffs)


results = [compare('corner', JOSS), compare('style', ACL + 'C18.xml'), compare('bert', ACL + 'N19.xml')]
(ROOT / 'evidence' / 'passages.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(results, ensure_ascii=False, indent=2))
