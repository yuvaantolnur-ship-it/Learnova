import unittest

from parser import regex_extract


class RegexExtractTests(unittest.TestCase):
    def test_extracts_common_score_pairs(self):
        cases = {
            "Score: 19 / 20": (19, 20),
            "19 out of 20": (19, 20),
            "Score: 19 | Total: 20": (19, 20),
            "Marks Obtained: 19, Maximum Marks: 20": (19, 20),
            "Total Marks 20; Score 19": (19, 20),
        }

        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(regex_extract(text), {"score": expected[0], "total": expected[1]})

    def test_rejects_invalid_or_unlabeled_numbers(self):
        for text in ("0/0", "11/10", "Math 19 20", "Score 19, homework 20"):
            with self.subTest(text=text):
                self.assertIsNone(regex_extract(text))


if __name__ == "__main__":
    unittest.main()
