# 開發文件（dev.md）
> 本檔由 /sync-docs 自動生成，請勿手動編輯——手改內容下次會被覆蓋。

## 環境需求
- Python 3（本機預覽用 `python3 -m http.server`）
- Node.js（僅用於語法檢查與檢視步驟資料，選用）
- 現代瀏覽器（頁面使用原生 ES modules）

## 快速啟動
純靜態網站，沒有建置工具、套件管理或 `.env`。頁面用 `<script type="module">`，不能用 `file://` 直接開，需起本機 server：

```bash
python3 -m http.server 8765
# 然後開 http://localhost:8765/
```

所有路徑必須是相對路徑（以 GitHub Pages 發佈，repo 根目錄即網站根目錄）。

## 常用指令
| 用途 | 指令 |
|---|---|
| 本機預覽 | `python3 -m http.server 8765` |
| 語法檢查 steps | `node --check topics/<主題>/steps.js` |
| 語法檢查 render | `node --check topics/<主題>/render.js` |
| 檢視主題步驟資料 | `node --input-type=module -e "import {steps} from './topics/<主題>/steps.js'; console.log(steps.length, steps.reduce((a,s)=>a+s.duration,0)/1000+'s'); for (const s of steps) console.log(s.chapter,'|',s.caption)"` |

注意：
- `steps.js` 不可使用 `window` / `document`，才能在 node 匯入。
- `render.js` 只能做 `node --check`，實際行為需在瀏覽器驗證（桌機與 390px 手機寬度）。
- 瀏覽器會快取 ES module，改完程式後請強制重新整理。
