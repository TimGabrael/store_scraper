# Scrape all products with prices from a given store
## Stores:
- [x] REWE
- [ ] Aldi Süd

# How to use:
1. Copy the default_db.db to the database folder and rename it to products.db,
this is where all the products will be stored.<br>
2. Execute each extractor by itself.<br>
Detailed instructions in the Sections dedicated to them.<br>
# REWE
## prerequisits:<br>
    The REWE extractor requires a cookie value to be set at the top of the file
    this can be extracted by opening any [rewe shop](https://shop.rewe.de) page and entering a postal code.
    After that the cookie should exist in the cookie tab of the browser.

run:
```
npx tsx extractor_rewe.ts
```
