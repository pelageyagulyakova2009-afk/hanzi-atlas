# Credits

The atlas does not invent readings, definitions, or stroke order. If a
source has no value, the JSON field is empty.

## Make Me a Hanzi

Stroke order (`graphics.txt`) and component decomposition
(`dictionary.txt`). The stroke graphics come from the Arphic PL KaitiM and
PL UKai fonts and are under the Arphic Public License. The dictionary
side is derived from Unihan and CJKlib.

https://github.com/skishore/makemeahanzi

## CC-CEDICT

English glosses and example words. CC BY-SA 4.0.

https://www.mdbg.net/chinese/dictionary?page=cedict

## Unihan

Unicode 17.0.0. Mandarin readings (`kMandarin`), radical numbers
(`kRSUnicode`), and stroke counts (`kTotalStrokes`).

https://www.unicode.org/copyright.html

## HSK 2.0

Character and word lists for levels 1–6, from the 2012 HSK syllabus, as
published in JSON by https://github.com/leonsilicon/hsk2.0. This project
uses that 1–6 scale. It does not include the later HSK 3.0 bands 7–9.

The built file is `public/data/atlas.json`: 2663 characters and 12537
component links. Raw downloads stay in `scripts/raw/` and are not part of
the repository.
