import ast
import unittest
from pathlib import Path

P = Path(__file__).resolve().parents[1] / 'quran-asr-service' / 'app.py'

class VerifiedReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source=P.read_text(encoding='utf8')
        tree=ast.parse(source)
        f=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_verified_word_units')
        cls.ns={}
        exec(compile(ast.Module(body=[f],type_ignores=[]),str(P),'exec'),cls.ns)

    def test_explicit_word_units(self):
        self.assertEqual(self.ns['_verified_word_units']({'words':[{'phonemes':['a','b']},{'phonemes':['c']}]}),[['a','b'],['c']])

    def test_whole_verse_not_fabricated(self):
        self.assertIsNone(self.ns['_verified_word_units']('a b c'))
        self.assertIsNone(self.ns['_verified_word_units']({'phonemes':['a','b','c']}))

    def test_invalid_words_rejected(self):
        self.assertIsNone(self.ns['_verified_word_units']({'words':[{'phonemes':['a']},{'phonemes':[]}]}))
        self.assertIsNone(self.ns['_verified_word_units']({'words':[{'phonemes':['a']},{'phonemes':'b'}]}))

if __name__=='__main__':
    unittest.main()
