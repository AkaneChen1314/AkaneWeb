Blue World 1.2 / r13｜2026-10-30 整合檔案清單
================================================

版本辨識：20261030-blueworld-r13
範圍：本日新增遊戲、收藏、互動、單張肖像及文件收尾統一記為r13，接續r12四款遊戲版。

新增遊戲：games/neonstrike/完整目錄，包含程式、兩張地圖封面、音效、Three.js模組、portal.css及回歸檢查。
直接載入：games/neonstrike/browser.js、browser-entry.js、build.mjs、.gitattributes、tests/direct-startup.mjs。browser.js已打包3D與音效，發布現成檔案不需編譯；修改遊戲來源後須重建，方法見遊戲README。
網站程式：index.html、main.js、archive.js、gallery-data.js、zone-effects.js、explore.js、ui-refresh.css。
目前展示的新圖片：assets/akane/s1-official-dress.webp、s3-ep34-4.webp、christmas-2023.webp、puzzle-casual.webp、portrait-raindrops.webp、portrait-anniversary.webp、sakura-kimono.webp。
原檔保留但目前未展示：outfit-hospital.webp、outfit-outing.webp、chibi-crepe.webp、quiet-smile.webp，皆在assets/akane/，來源與原始標記保留。
素材來源：assets/akane/sources.json、圖片與資料來源.md。
說明與紀錄：VERSION.txt、README_先看這裡.md、README_更新說明.txt、README_新增與修改檔案.txt、程式導覽.md、測試紀錄.md、games/neonstrike/README.md、games/starbreak/README_更新說明.txt及測試紀錄.md。

三張直幅一次只顯示選中的一張，主題／左右鍵切換，放大保留完整圖；四張橫幅與三張直幅各自循環。遊樂室有六種互動。圖片、影片、字型與各遊戲目錄須維持原有相對路徑。
原始E:\game未修改；原有其他四款遊戲與存檔格式保留。不要上傳測試截圖、錄影或output目錄。

以下為r12歷史檔案清單：

Blue World 1.2 / r12｜新增與修改檔案
===================================

修訂日期：2026-10-23
版本辨識：20261023-blueworld-r12-ui-12
比較基準：上一份 r11 四款遊戲完整包
公開顯示版本：1.2

本次新增 1 個檔案、修改 7 個檔案；全部位於網站根目錄。
四款遊戲、圖片、影片與字型檔案都沒有修改。

一、新增檔案
------------
ui-refresh.css
  最後載入的 UI 樣式層。統一 Akane 本機字型、可讀字級、
  中英文分流字體、統一字重、入口卡與動態卡收尾、深色主要按鈕、
  文字對比、同列卡片對齊、鍵盤焦點、卡片圓角與手機細節。

二、修改檔案
------------
index.html
  載入 ui-refresh.css，更新 r12 版本辨識與頁尾日期。

VERSION.txt
  Edition 更新為 20261023-blueworld-r12-ui-12；公開版本仍是 1.2。

README_先看這裡.md
  新增 r12 重點、部署核對方式與此次更新包範圍。

README_更新說明.txt
  新增字體、字級、按鈕、卡片與驗證結果的完整變更記錄。

README_新增與修改檔案.txt
  本清單，取代上一份 r11 補修清單。

程式導覽.md
  說明 ui-refresh.css 的載入位置、設計變數、按鈕層級與斷點。

測試紀錄.md
  新增 r12 的 1264px 桌機、390px 手機、溢出、控制項與
  瀏覽器 console 檢查結果。

三、只更新現有 r11 網站
-----------------------
1. 先備份目前的 AkaneWeb 儲存庫。
2. 將上述 8 個根目錄檔案放到儲存庫根目錄。
3. 新增 ui-refresh.css，其他 7 個同名檔案選擇覆蓋。
4. 不要刪除 assets、games、shared 或原有 CSS／JavaScript。
5. 一次提交全部變更，等待 GitHub Pages 最後一筆部署完成。
6. 開啟正式網站並檢視原始碼，搜尋
   20261023-blueworld-r12-ui-12，確認載入新版。
7. 若仍看到舊字級或舊按鈕，請重新整理或清除網站快取。

四、不必重新上傳
----------------
assets/
  角色圖片、影片、分享圖、遊戲封面與本機字型全部保持不變。

games/
  Abyss、Arcane、Trader、Starbreak 的程式、素材與存檔格式
  全部保持不變。

shared/
  既有 Akane 字型宣告與遊戲返回元件保持不變；r12 直接重用。

五、完整包
----------
第一次發布、仍使用三款遊戲舊版，或想做完整備份時，請使用
完整網站包。把 AkaneWeb-main 資料夾裡的全部內容放進儲存庫
根目錄，保持 index.html、assets、games、shared 位於同一層。
不需要 npm、編譯或額外安裝程式；不要直接上傳 ZIP。
