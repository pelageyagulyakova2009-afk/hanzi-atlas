# Данные атласа

Скрипт собирает `public/data/atlas.json` только из открытых источников.
Ни одного значения (пиньинь, перевод, черта) в коде нет: если поля нет в
источнике, в JSON остаётся пустая строка или пустой массив.

Сырые файлы лежат в `scripts/raw/` и не коммитятся (см. `.gitignore`).
Готовый `atlas.json` коммитится, чтобы сцена открывалась без скачивания.

## Лицензии

- **Make Me a Hanzi** — `dictionary.txt` и `graphics.txt`. Графика черт
  происходит из шрифтов Arphic (Arphic Public License). Словарь собран из
  Unihan и CJKlib. https://github.com/skishore/makemeahanzi
- **CC-CEDICT** — слова и английские значения. CC BY-SA 4.0.
  https://www.mdbg.net/chinese/dictionary?page=cedict
- **Unihan** (Unicode 17.0.0) — чтение `kMandarin`, ключ `kRSUnicode`,
  число черт `kTotalStrokes`. https://www.unicode.org/copyright.html
- **HSK 2.0** — официальные списки слов и знаков уровней 1–6 в виде JSON
  из https://github.com/leonsilicon/hsk2.0 (источник списков — программа
  HSK 2012). Уровней 7–9 здесь нет: это шкала HSK 3.0, а в атласе поле
  `hsk` только 1–6. Уникальных знаков около 2660.

## Куда класть файлы

Всё в `scripts/raw/`:

| Файл | Откуда |
|---|---|
| `HSK2.0_chars_level1.json` … `level6` | https://raw.githubusercontent.com/leonsilicon/hsk2.0/main/HSK2.0_chars_level1.json (и 2–6) |
| `HSK2.0_words_level1.json` … `level6` | тот же репозиторий, `HSK2.0_words_levelN.json` |
| `dictionary.txt` | https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt |
| `graphics.txt` | https://raw.githubusercontent.com/skishore/makemeahanzi/master/graphics.txt |
| `cedict.txt.gz` | https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz |
| `Unihan.zip` | https://www.unicode.org/Public/17.0.0/ucd/Unihan.zip |

Из архива Unihan нужны только `Unihan_Readings.txt` и
`Unihan_RadicalStrokeCounts.txt`. Скрипт загрузки распаковывает их сам.

## Как запустить

Из корня проекта, Node 18+:

```bash
node scripts/fetch-raw.mjs
node scripts/build-atlas.mjs
```

`build-atlas.mjs` сам вызывает загрузку, если какого-то файла нет.
Повторный запуск не скачивает уже лежащие файлы.

В конце печатается число знаков, компонент, рёбер и размер `atlas.json`.
Если знаков не в диапазоне 2000–3500, скрипт завершается с кодом 1.

## Короткие ключи в atlas.json

Файл без отступов. Объект `keys` внутри JSON повторяет эту таблицу.

| Ключ | Поле |
|---|---|
| `c` `p` `m` `h` `r` `n` | char, pinyin, meaning, hsk, radical, strokeCount |
| `k` | components — знаки из IDS-разбора Make Me a Hanzi |
| `f` | phonetic — фонетик из Make Me a Hanzi, если знак фонетический; иначе пустая строка |
| `t.d` `t.q` | stroke SVG paths, medians (координаты округлены до целых) |
| `w[].z` `w[].p` `w[].m` `w[].h` | до 4 слов CEDICT: иероглифы, пиньинь, первый перевод, уровень HSK или null. Сначала слова из более низкого уровня |

Значение знака — глосса CEDICT с тем же пиньинем, что `kMandarin`. Если первая
статья — фамилия (`surname Shui`), берётся следующее значение того же чтения
(`water`). Ссылки вида `您[nin2]` переводятся в пиньинь с тоном.
| `edges` | пары индексов знаков с общим компонентом |
| `comps` | компонент → индексы знаков, где он встретился |

Рёбра строятся только для компонента, который есть у 2–24 знаков.
Полная клика для 口 или 氵 дала бы сотни тысяч рёбер и нечитаемый граф
на следующем этапе. Такие компоненты остаются в `comps`.
