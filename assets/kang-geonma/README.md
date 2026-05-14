# Kang Geonma Import Folder

Put licensed or otherwise authorized reference images for the character here.

Supported formats:
- `.png`
- `.jpg`
- `.jpeg`
- `.webp`
- `.gif`

The importer uses the first 4 image files in filename order.

```bash
npm run import:character -- --name="강건마" --alias="kang-geonma" --folder="assets/kang-geonma" --email="n4topbada@gmail.com"
```

Add `--public` if this should be visible in the character shop.

If you have authorized direct image URLs, save them to a text file and download them first:

```bash
npm run download:images -- --folder="assets/kang-geonma" --manifest="assets/kang-geonma/urls.txt"
```
