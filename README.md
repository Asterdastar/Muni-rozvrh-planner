# Export rozvrhu IS MU do JSON

Samostatné rozšíření pro Brave/Chrome. Načte předměty a jejich rozvrhy z přihlášeného IS MU a stáhne soubor `rozvrh-predmety.json`, který lze importovat do aplikace ve složce `github-pages`.

Rozšíření pouze vytvoří soubor ke stažení. **Neodesílá rozvrh na GitHub, do lokálního serveru ani na jiný server.** Soubor obsahuje osobní údaje o rozvrhu; nedávej ho do veřejného repozitáře.

## Instalace v Brave

1. Rozbal nebo ponech složku **Browser extension** v trvalém umístění na počítači.
2. Otevři v Brave `brave://extensions`.
3. Zapni **Režim pro vývojáře**.
4. Klikni na **Načíst rozbalené** a vyber tuto složku `github-pages-export-extension`.
5. Pokud jsi měl otevřenou kartu IS MU už před instalací, obnov ji klávesami `Ctrl+R`.

V Chrome je postup obdobný na stránce `chrome://extensions`.

## Vytvoření exportu

1. Přihlas se do IS MU a otevři kartu **Registrace a zápis předmětů**. 
2. Klikni na ikonu rozšíření **Rozvrh IS MU – export JSON**.
3. Klikni na **Načíst a stáhnout JSON** a potvrď umístění staženého souboru.
4. Výsledkem je `rozvrh-predmety.json`. Pokud některý předmět nebo doplňkový údaj nebyl dostupný, popup zobrazí upozornění.

Každý nový export obsahuje právě načtený seznam a při importu do GitHub Pages verze nahradí předchozí data v tomto prohlížeči.

## Import do GitHub Pages kalendáře

1. Publikuj obsah složky `github-pages` podle návodu v hlavním [README projektu](../README.md).
2. Otevři zveřejněnou stránku kalendáře ve stejném prohlížeči.
3. Klikni na **Vybrat export JSON** a zvol stažený `rozvrh-predmety.json`.
4. Kalendář data uloží do lokálního úložiště prohlížeče pro danou doménu. Jiní návštěvníci stránky je neuvidí.

**Nikdy nenahrávej `rozvrh-predmety.json` do veřejného repozitáře.** Do repozitáře patří pouze soubory aplikace: `index.html`, `app.js` a `styles.css`.

## Export kalendáře jako PNG

PNG se exportuje přímo z otevřeného kalendáře, aby obrázek odpovídal zobrazené dvojici týdnů a vybraným seminárním skupinám:

1. Otevři lokální kalendář nebo svou GitHub Pages stránku a případně nahraj JSON export.
2. Vyber požadované seminární skupiny a nastav dvojici týdnů pomocí šipek nebo tlačítka **Dnes**.
3. Klikni na **PNG** vpravo v hlavičce kalendáře. Stáhne se ostrý obrázek obou zobrazených týdnů.

## Co rozšíření načítá

- Detaily předmětů a seminárních skupin dostupné z odkazů na aktuální stránce IS MU.
- Rozvrhové časy, učitele a místnosti z načtených detailů.
- Odkazy na místnosti, pokud jsou uvedené na stránce předmětu.
- Fakultní datum začátku výuky z veřejného harmonogramu IS MU pro období importovaných předmětů.

Přístup do IS MU zůstává v prohlížeči. Rozšíření nečte ani neukládá heslo a pro přenos používá přihlášenou relaci právě otevřené stránky.
