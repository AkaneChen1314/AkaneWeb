Blue World 1.2 / r14｜2026-11-02～11-13 整合檔案清單
================================================

版本辨識：20261113-blueworld-r14-seven-games-art

11-13 新增兩款遊戲（同屬 r14）：
- 同日封面追加：改用 cover-midnight-art.webp 與 cover-serpent-art.webp 兩張生成式遊戲情境插畫；每張 1672×941，保留中文標題為 HTML 文字。提示及來源見 assets/新遊戲封面生成紀錄.md。
- games/midnight/：午夜擂台；games/serpent/：霓境蛇行。自訂字體、中文導讀與可閱讀原始碼；支援遊戲館返回暫停、音訊停止及重入接續。
- assets/cover-midnight.png、assets/cover-serpent.png：分別擷取遊戲戰場與蛇靈展示台，不使用外部圖片。
- index.html、main.js：七款遊戲卡片、推薦定位、玩法介紹、隨機選擇與入口；桌機一主卡＋三排雙欄，手機單欄。
- 新快取辨識 20261113-blueworld-r14-seven-games-art；既有霓光突擊打包資源仍沿用 districts 快取。
- 更新 README、程式導覽、來源及測試紀錄；下方舊內容保留其當時檢查範圍。

範圍：11-02首頁與可讀性、11-04原始碼排版與註解、11-13霓光突擊8.0 DISTRICTS統一記為r14。

霓光突擊新增：games/neonstrike/navigation.js（導航格與A*尋路）、districts.js（區塊零件、自動補碰撞與合併繪製）、district-maps.js（兩張地圖的區塊配置）。
霓光突擊修改：main.js、index.html、styles.css、touch.css、lobby.js、build.mjs（註解）、tests/lobby-briefing.mjs、README.md；browser.js以esbuild 0.28.2及build.mjs相同參數重新打包。assets/cover-art-notes.md改名為assets/封面插畫說明.md。
排版與註解新增：.editorconfig、.prettierrc.json、.prettierignore、程式碼閱讀指南.md。
排版範圍：網站根目錄、shared與五款遊戲內的可編輯HTML、CSS、JS／MJS／CJS；包含既有測試與開發腳本的格式整理。23個主要JavaScript模組與主要HTML／CSS新增中文閱讀提示。完整修改清單可查看Git提交。
首頁程式：index.html、world.css、ui-refresh.css。光色切換沿用world.js、blue-world-tone-v1及既有三款光色；新增的是頁尾原生details收合界面。
快取：網站與五款遊戲入口標記為20261104-blueworld-r14-source；霓光突擊樣式、觸控、大廳與browser.js改為20261113-blueworld-r14-districts。網站index.html的版本標記與頁尾同步為20261113-blueworld-r14-districts、2026.11.13 r14。
版本與說明：VERSION.txt、README_先看這裡.md、README_更新說明.txt、README_新增與修改檔案.txt、程式導覽.md、程式碼閱讀指南.md、更新與測試紀錄.md（原測試紀錄.md改名）、圖片與資料來源.md。

圖片、音效、字型、影片、第三方vendor及其他四款遊戲的玩法與存檔格式不變。本機檢查工具、截圖、開發伺服器、套件暫存與esbuild執行檔都不屬於發布檔案。

以下為r13歷史檔案清單：

Blue World 1.2 / r13｜2026-10-30 整合檔案清單
================================================

版本辨識：20261030-blueworld-r13-touch
範圍：本日新增遊戲、收藏、互動、單張肖像及文件收尾統一記為r13，接續r12四款遊戲版。

新增遊戲：games/neonstrike/完整目錄，包含程式、兩張地圖封面、音效、Three.js模組、portal.css及回歸檢查。
手機操作新增：games/neonstrike/touch-controls.js、touch.css、tests/touch-controls.test.mjs。同步修改遊戲main.js、index.html、styles.css、portal.css、重新產生browser.js；網站入口、說明與快取更新，仍歸r13。
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
