Blue World 1.2 / r11｜新增與修改檔案
===================================

以本次上傳的 AkaneWeb-main 為比較基準。
新增 29 個檔案，修改 8 個檔案，沒有刪除任何舊檔。
完整包共 199 個檔案；更新包只有必要的 37 個新增／修改檔案。

一、修改：以下 8 個檔案在儲存庫根目錄，請覆蓋
------------------------------------------------
index.html
  第四張遊戲卡、獨立封面、心情按鈕、四款文案及 r11 快取批次。
main.js
  Starbreak 介紹／路徑／推薦，四款路由，分頁休息狀態同步。
styles.css
  四張遊戲卡改為雙欄 2 × 2；手機維持單欄。
VERSION.txt
  公開版本仍是 1.2，修訂批次更新為 r11。
README_更新說明.txt
  原位置接續記錄 r11，補上兩種壓縮包的更新方式。
README_先看這裡.md
  四款遊戲、發布／局部更新及新遊戲存檔移轉說明。
測試紀錄.md
  保留 r2 至 Final，再接續 r11 的修改及實際檢查。
程式導覽.md
  說明第四款遊戲、精簡 Boss 列、返回與存檔格式。

二、新增：整個 games/starbreak/ 資料夾（28 個檔案）
---------------------------------------------------
games/starbreak/index.html
games/starbreak/game.js
games/starbreak/style.css
games/starbreak/ui-v12.css
games/starbreak/ui-v13.css
games/starbreak/ui-v14.css
games/starbreak/ui-v15.css
games/starbreak/ui-blueworld.css
games/starbreak/favicon.svg
games/starbreak/VERSION.txt
games/starbreak/assets/starbreak.png
games/starbreak/assets/boss-core.png
games/starbreak/assets/boss-queen.png
games/starbreak/assets/boss-rift.png
games/starbreak/assets/boss-tyrant.png
games/starbreak/README_更新說明.txt
games/starbreak/README_遊戲說明.txt
games/starbreak/操作說明.md
games/starbreak/測試紀錄.md
games/starbreak/程式導覽.md
games/starbreak/tests/engine.test.cjs
games/starbreak/tests/custom-v11.test.cjs
games/starbreak/tests/custom-v12.test.cjs
games/starbreak/tests/custom-v13.test.cjs
games/starbreak/tests/custom-v14.test.cjs
games/starbreak/tests/custom-v15.test.cjs
games/starbreak/tests/ui-smoke.cjs
games/starbreak/tests/balance.cjs

三、新增：本清單
---------------
README_新增與修改檔案.txt

四、沒有修改，不必重傳
-----------------------
原 assets/ 全部角色圖片、影片、封面與字型。
games/abyss/ 深境冒險。
games/arcane/ 蒼穹決戰：星界牌陣。
games/trader/ 百億炒股人生。
shared/ 及其他原有網站檔案。
包含你自行更換的 s2-ep21-6.webp，原始位元組保持不變。

五、只更新 GitHub 的方式
------------------------
1. 先備份儲存庫，再解壓「新增／修改更新包」。
2. 更新包第一層直接是 index.html、games 與說明文件，沒有外層資料夾。
3. 把 8 個修改檔案與本清單放到儲存庫根目錄，依原檔名覆蓋。
4. 把整個 starbreak 資料夾放在原本 games/ 內。
5. 結果應為 games/starbreak/index.html，不是 games/index.html，
   也不是 AkaneWeb-main/games/starbreak/index.html 再多包一層。
6. 一次提交變更，等待 GitHub Pages 最後一筆部署完成。
7. 網頁原始碼搜尋 20261004-blueworld-r11，可核對新版。

使用 GitHub Desktop 時，直接把更新包內容複製到本機儲存庫根目錄，
確認變更後提交即可。網站不需要 npm、編譯或額外安裝程式。

使用 GitHub 網頁時，根目錄檔案與 games/starbreak/ 分開放入對應位置。
拖曳資料夾後先確認上傳清單有保留 starbreak/assets/ 等路徑；
若資料夾被攤平，請取消，改用 GitHub Desktop 保留階層。
不要直接上傳 ZIP，GitHub Pages 不會替你解壓。

完整包含全部檔案，適合第一次發布或整包備份。
更新包只含上述新增／修改檔案，需要套在此次提供的原網站上。
