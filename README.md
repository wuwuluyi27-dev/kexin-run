# 可欣快跑

这是一个适合直接导入 Netlify 部署的纯前端项目，包含：

- 游戏前端：`index.html`、`style.css`、`script.js`
- Netlify Functions：`netlify/functions`
- Supabase 建表 SQL：`supabase/leaderboard.sql`

## 项目根目录

把整个项目根目录上传到 GitHub，而不是只上传静态文件。

```text
ai游戏/
├─ index.html
├─ style.css
├─ script.js
├─ manifest.json
├─ icon.svg
├─ netlify.toml
├─ README.md
├─ netlify/
│  └─ functions/
│     ├─ get-leaderboard.js
│     ├─ submit-score.js
│     └─ _lib/
│        └─ leaderboard.js
└─ supabase/
   └─ leaderboard.sql
```

## Netlify 部署

1. 把整个 `ai游戏` 文件夹内容上传到 GitHub 仓库。
2. 在 Netlify 点击 `Add new site`。
3. 选择 `Import an existing project`。
4. 连接 GitHub，并选择这个仓库。
5. 保持项目根目录为仓库根目录，不要选子文件夹。
6. 如果 Netlify 询问构建设置，使用：
   - Base directory：留空
   - Build command：留空
   - Publish directory：`.`
7. 在 Netlify 的环境变量中添加：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
8. 点击部署。

## Supabase 建表

把 `supabase/leaderboard.sql` 的内容粘贴到 Supabase SQL Editor 执行。

## 部署后测试

把下面域名中的 `你的站点域名` 换成实际 Netlify 地址：

- `https://你的站点域名/.netlify/functions/get-leaderboard`
- `https://你的站点域名/.netlify/functions/submit-score`

如果函数部署成功：

- `get-leaderboard` 会返回 JSON
- `submit-score` 直接浏览器打开时会返回“函数已部署成功，请使用 POST 提交分数”
