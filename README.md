# Blue World｜網站說明與文件入口

黑川茜非官方粉絲收藏網站，包含角色資料、三季圖庫、無聲動態、小茜互動，以及七款獨立自製遊戲。

[開啟網站](https://akanechen1314.github.io/AkaneWeb/) · [小遊戲專區](https://akanechen1314.github.io/AkaneWeb/#games)

## 目前版本

- 網站公開版本：**1.2**；網站修訂：**r14**。
- r14 整合期間：2026-11-02～2026-11-13。
- 已發布的程式與素材辨識：`20261113-blueworld-r14-abyss`，亦記於 [VERSION.txt](VERSION.txt)。
- 最新一次是深境冒險的可讀性與手機戰鬥版面優化（前一次為星夜突圍改版與遊戲開啟速度），仍併入 r14；遊戲來源版本與存檔格式不變。

## 要找什麼

| 需求                             | 文件                                               |
| -------------------------------- | -------------------------------------------------- |
| 看每個 r 版本改了什麼、測了什麼  | [版本更新與測試紀錄](版本更新與測試紀錄.md)        |
| 找要修改的 HTML、CSS、JavaScript | [網站程式碼導覽](網站程式碼導覽.md)                |
| 查角色圖片、影片與資料出處       | [網站素材與來源](網站素材與來源.md)                |
| 查遊戲封面及完整生成提示         | [遊戲封面與生成紀錄](assets/遊戲封面與生成紀錄.md) |

## 七款遊戲

| 遊戲                       | 入口                               | 遊戲文件                                                                                                                                  |
| -------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| NEON STRIKE：霓光突擊      | [開啟](index.html#play=neonstrike) | [說明、操作與來源版本](games/neonstrike/README.md)                                                                                        |
| 深境冒險                   | [開啟](index.html#play=abyss)      | 遊戲內說明與圖鑑                                                                                                                          |
| 蒼穹決戰：星界牌陣         | [開啟](index.html#play=arcane)     | 遊戲內玩法說明                                                                                                                            |
| 百億炒股人生               | [開啟](index.html#play=trader)     | 遊戲內教學                                                                                                                                |
| 星夜突圍：STARBREAK        | [開啟](index.html#play=starbreak)  | [操作手冊](games/starbreak/遊戲操作手冊.md)、[程式碼導覽](games/starbreak/程式碼導覽.md)、[版本與測試](games/starbreak/版本與測試紀錄.md) |
| 午夜擂台：MIDNIGHT CIRCUIT | [開啟](index.html#play=midnight)   | [網站整合說明](games/midnight/README.md)                                                                                                  |
| 霓境蛇行：NEON SERPENT     | [開啟](index.html#play=serpent)    | [快速開始](games/serpent/README.md)、[完整規則](games/serpent/完整遊戲規則.md)                                                            |

七款遊戲與黑川茜及《我推的孩子》無關。推薦按鈕只會定位卡片，查看介紹後才開始。返回遊戲館會暫停；同次開著網頁可接續，重新整理是否保留進度依各遊戲說明。不同網址、本機檔案與網站間不會自動搬移存檔。

## 本機查看與發布

這是純靜態網站，發布現有檔案不需安裝 npm 或重新編譯。

1. 保持 `index.html`、`assets/`、`games/`、`shared/` 位於同一層。
2. 本機可開啟 `index.html`；若瀏覽器限制本機資源，可在根目錄以已安裝的 Python 執行 `python -m http.server 8765 --bind 127.0.0.1`，再開啟 `http://127.0.0.1:8765/`。
3. 更新 GitHub 時一次提交完整變更，包含文件改名與合併後移除的舊檔；不要只上傳 ZIP 或再套一層資料夾。
4. 等待對應提交的 GitHub Pages 部署成功，再到正式網站核對內容及 `VERSION.txt`。

如果真正修改霓光突擊原始碼或音效，須依該遊戲的 [重新打包說明](games/neonstrike/README.md#修改來源後重新打包) 更新 `browser.js`；單純整理文件不需打包。

分享圖為 [blue-world-share-r10.jpg](assets/blue-world-share-r10.jpg)。分享網址的 `#akane` 等片段只控制開啟的專區，不影響分享圖。舊訊息的預覽可能仍使用先前快取。

## 素材與資料

網站封裝 55 張角色圖片（含目前未展示原檔）及九段無聲影片；圖片、字型、影片及遊戲資源由網站自身載入。角色素材權利屬原權利人，來源及保留標記見素材文件。

深境冒險圖鑑僅供閱讀：實際遭遇的怪物才解鎖，未發現項目不顯示完整資料；已結算特殊事件會保存結果，讀檔不重複發放獎勵。

## 舊文件搬到哪裡

| 原檔名                                    | 現在位置                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------- |
| `README_先看這裡.md`                      | [README.md](README.md)                                                 |
| `程式碼閱讀指南.md`                       | [網站程式碼導覽.md](網站程式碼導覽.md)                                 |
| `程式導覽.md`                             | [網站程式碼導覽.md](網站程式碼導覽.md)                                 |
| `更新與測試紀錄.md`                       | [版本更新與測試紀錄.md](版本更新與測試紀錄.md)                         |
| `README_更新說明.txt`                     | [版本更新與測試紀錄.md](版本更新與測試紀錄.md)                         |
| `README_新增與修改檔案.txt`               | [版本更新與測試紀錄.md](版本更新與測試紀錄.md)                         |
| `圖片與資料來源.md`                       | [網站素材與來源.md](網站素材與來源.md)                                 |
| `assets/封面插畫說明.md`                  | [assets/遊戲封面與生成紀錄.md](assets/遊戲封面與生成紀錄.md)           |
| `assets/新遊戲封面生成紀錄.md`            | [assets/遊戲封面與生成紀錄.md](assets/遊戲封面與生成紀錄.md)           |
| `games/neonstrike/assets/封面插畫說明.md` | [assets/遊戲封面與生成紀錄.md](assets/遊戲封面與生成紀錄.md)           |
| `games/starbreak/操作說明.md`             | [games/starbreak/遊戲操作手冊.md](games/starbreak/遊戲操作手冊.md)     |
| `games/starbreak/測試紀錄.md`             | [games/starbreak/版本與測試紀錄.md](games/starbreak/版本與測試紀錄.md) |
| `games/starbreak/程式導覽.md`             | [games/starbreak/程式碼導覽.md](games/starbreak/程式碼導覽.md)         |
| `games/serpent/遊戲規則.md`               | [games/serpent/完整遊戲規則.md](games/serpent/完整遊戲規則.md)         |
