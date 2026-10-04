# Rozvrh předmětů z IS MU

Lokální týdenní kalendář s importem přes rozšíření pro Brave. Aplikace používá přihlášení v již otevřeném IS MU; nepřebírá ani neukládá heslo.

## Spuštění

V PowerShellu spusť z této složky:

```powershell
python main.py
```

Kalendář se otevře na `http://127.0.0.1:8765`. Zastavíš ho pomocí `Ctrl+C`.

## Připojení Brave

1. V Brave otevři `brave://extensions` a zapni **Režim pro vývojáře**.
2. Klikni na **Načíst rozbalené** a vyber složku `extension` v tomto projektu. Pokud už rozšíření nainstalované je, klikni po jeho změně na **Znovu načíst** a pak obnov otevřenou kartu IS MU.
3. Nech spuštěnou aplikaci a otevři přihlášený seznam předmětů v IS MU.
4. Klikni na ikonu rozšíření **Rozvrh předmětů – IS MU** a zvol **Načíst předměty**. Skript se do stránky vloží při jejím načtení, proto po instalaci nebo obnovení rozšíření obnov také kartu IS MU.

Načtené stránky se uloží do místního souboru `courses.json`. Další import seznam nahradí. Kalendář zobrazuje dva po sobě jdoucí pracovní týdny pod sebou, s hodinami na ose X a dny na ose Y. U každého týdne je uvedeno jeho ISO číslo a informace, zda jde o sudý nebo lichý týden; šipky posouvají zobrazenou dvojici o týden. Rozvrhové skupiny s datovanými termíny jsou automaticky rozpoznány jako týdenní, sudé, liché nebo jednotlivě vypsané podle intervalů termínů a případného označení v IS MU. V postranním panelu se frekvence zobrazuje u každé skupiny. Začátek výuky se načítá z [oficiálního harmonogramu období fakult IS MU](https://is.muni.cz/predmety/obdobi?lang=cs); předměty a jejich seminární skupiny se zobrazí až od začátku výuky příslušné fakulty. Výchozí týden se nastaví na začátek výuky fakulty s největším počtem importovaných předmětů. Předměty s automaticky vybranou jedinou skupinou jsou při otevření panelu sbalené. Pokud IS MU poskytuje odkaz na místnost, její název v bloku rozvrhu otevře příslušnou stránku místnosti v nové kartě. Po importu rozšíření zobrazí počet získaných odkazů na místnosti; pokud jsou odkazy nulové, rozšíření znovu načti a import opakuj.

Kliknutím na barevnou tečku vedle předmětu se otevře samostatný popup pro výběr RGB barvy a HEX kódu; lišta předmětu se při tom neroztahuje ani neposouvá. Zvolená barva se uloží a použije u předmětu v panelu i kalendáři. Kliknutím na horní lištu předmětu se sbalí nebo rozbalí jeho seminární skupiny. Značky a bloky vybraných skupin v kalendáři zobrazují iniciály prvních dvou slov názvu předmětu spolu s kódem skupiny. Před výběrem jsou skupiny zobrazené jako malé klikací značky v kalendáři a jako souhrnné karty v panelu. Karty ukazují předmět, kód skupiny, časy a vyučujícího; pokud jméno vyučujícího není uvedeno přímo u skupiny, použije se jméno z části „Vyučující“ detailu předmětu. Seznam termínů je zkrácen na tři různé dny/časy. Kliknutím na značku v kalendáři nebo kartu v panelu skupinu vybereš a její rozvrh se zobrazí v kalendáři; pokud má skupina jen konkrétní vypsané termíny a žádný v právě zobrazeném týdnu, kalendář přejde na její nejbližší nadcházející termín. Alternativní značky tohoto předmětu zmizí z kalendáře, ale všechny skupiny zůstávají dostupné v panelu. Text v rozvrhových blocích se zalamuje a výška řádku se automaticky přizpůsobí obsahu, takže se nic neořezává. Při najetí na rozvrhový blok nebo jeho výběru klávesnicí se navíc zobrazí celý popis v plovoucí kartě mimo mřížku. Značky, které se časově překrývají s jinou vybranou skupinou, se z kalendáře skryjí. Pokud si záměrně vybereš více kolidujících předmětů, zůstanou všechny vybrané a jejich bloky se zobrazí v samostatných řádcích; výška dne se automaticky zvětší. Každý den má jednu kompaktní časovou osu; další prostor přibude jen pro značky, které je nutné oddělit, nebo při překrytí vybraných hodin.

Popup pro barvy zobrazuje RGB a HEX vedle sebe; tlačítkem **Nová unikátní barva** vybereš barvu, která se nepoužívá u jiného předmětu. Po výběru seminární skupiny se její předmět v postranním panelu automaticky sbalí.

V popupu jsou RGB výběr a HEX pole vedle sebe; pod nimi tlačítko **Nová unikátní barva** vybere odstín, který není použit u jiného předmětu. Po výběru seminární skupiny se její předmět automaticky sbalí v postranním panelu, přičemž skupiny zůstávají dostupné po opětovném rozbalení.

## Omezení

Rozšíření zatím pracuje se stránkami `https://is.muni.cz/`. Seminární skupiny vybírá jen z příslušné sekce a jen tehdy, když jejich kód začíná kódem daného předmětu; jiné popisky obsahující lomítko, například jazykové varianty, se za skupiny nepovažují. Časy a učebny rozpoznává z textu detailu předmětu; skupiny bez rozpoznatelného rozvrhu se v panelu označí. Odkazy na místnosti se načítají z odkazů IS MU v detailu předmětu. Po změně rozšíření ho znovu načti na `brave://extensions`, obnov kartu IS MU a předměty znovu importuj. Data zůstávají na tomto počítači.

## GitHub Pages verze

Samostatná statická kopie je ve složce `github-pages`. Obsah této složky lze publikovat na GitHub Pages bez Pythonu. Rozšíření může po importu stáhnout export `rozvrh-predmety.json`; v GitHub Pages kopii jej nahraj tlačítkem **Vybrat export JSON**. Importovaný rozvrh i vlastní barvy se uloží pouze v lokálním úložišti daného prohlížeče. Export obsahuje osobní rozvrh — nikdy jej nepřidávej do GitHub repozitáře.

### Publikování vlastní kopie

1. Na GitHubu vytvoř nový repozitář. Do něj nahraj **obsah** složky `github-pages` (tedy `index.html`, `app.js` a `styles.css` přímo do kořene repozitáře), nikoli složku s osobním souborem `courses.json`.
2. V repozitáři otevři **Settings → Pages**. V části **Build and deployment** zvol **Deploy from a branch**, vyber větev `main` a složku `/(root)`, potom ulož.
3. Počkej, než GitHub Pages stránku publikuje. Odkaz bude typicky `https://TVUJ-UCET.github.io/NAZEV-REPOZITARE/`.
4. V Brave otevři svou publikovanou stránku. V IS MU klikni na ikonu rozšíření a zvol **Načíst předměty**; potom klikni na **Stáhnout soubor pro GitHub Pages**. Na stránce kalendáře zvol **Vybrat export JSON** a vyber stažený `rozvrh-predmety.json`.
5. Při pozdějším importu předmětů vytvoř a nahraj nový export. Rozvrh zůstává v úložišti daného prohlížeče a domény; při použití jiného zařízení nebo jiného prohlížeče nahraj export znovu.

Původní `python main.py` běh a rozšíření zůstávají zachované. Import přes rozšíření se nejprve pokusí zapsat data i do lokálního serveru; pokud ten neběží, export pro GitHub Pages je přesto dostupný.
