# Translate Agent 🌐

基于 JS 的翻译 AI Agent，打包成三个独立的 Windows 可执行文件。兼容任意 OpenAI 格式 API，无需安装 Node.js，无需 HTTP 服务。

## 产物

| 文件 | 说明 |
| ---- | ---- |
| `dist/tran.exe` | 命令行翻译（中英互转，大段文本，纯 AI） |
| `dist/word.exe` | 命令行单词查询（内嵌 5 万词词典 + AI 拓展） |
| `dist/translate_gui.exe` | 桌面 GUI（Electron，翻译 + 单词 + 对话，无控制台窗口） |

## 功能概览

### 翻译（tran）
- 自动中英互转：输入中文→英文，输入英文→中文
- 支持 15 种语言切换（`tran change`）
- 持续翻译模式（`tran mode`）
- 翻译历史记录

### 单词查询（word）
- **本地词典优先**：内嵌 ECDICT 5 万常用词，秒回音标+释义，0 token
- **AI 拓展**：近义词、反义词、派生词、常用搭配、例句、助记（按难度调整）
- 11 级难度：初中 / 高中 / 高考 / 四级 / 六级 / 考研 / 专四 / 专八 / 雅思 / 托福 / GRE
- 持续查词模式（`word mode`）
- 单词本收藏
- 查词历史记录

### 桌面 GUI（translate_gui）
- 翻译 / 单词 / 对话 三个功能标签
- 单词查询支持实时中断（输入新单词自动取消旧请求）
- 收藏标签：单词本管理（删除、查询、导出 txt）
- 历史标签：翻译/查词/对话历史（筛选、重查、清空）
- 设置标签：API 配置 + 翻译方向 + 单词难度
- 无控制台窗口（PE subsystem = GUI）

### 共享数据
三个程序共享同一份配置和数据：
- `~/.translate-agent/config.json` — API 地址 / Key / 模型 / 翻译方向 / 单词难度
- `<exe 目录>/data/history.json` — 历史记录（自动清理，≤30MB）
- `<exe 目录>/data/favorites.json` — 收藏单词（无大小限制）

## 快速使用

### 1. 配置 API
```
tran setup
```
按提示输入 API 地址和 Key，自动探测模型供选择。

常见 API 地址：

| 服务商 | API 地址 |
| ------ | -------- |
| DeepSeek | `https://api.deepseek.com` |
| OpenAI | `https://api.openai.com` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode` |
| Moonshot | `https://api.moonshot.cn` |
| 本地 Ollama | `http://localhost:11434` |

### 2. 命令一览

**翻译：**
```
tran "hello world"            翻译（自动中英互转）
tran mode                     持续翻译模式（Ctrl+C 退出）
tran change                   切换目标语言
tran history                  翻译历史
tran setup / status / -h      配置 / 查看状态 / 帮助
```

**单词：**
```
word paper                    查词（本地词典 + AI 拓展）
word mode                     持续查词模式（Ctrl+C 退出）
word fav <单词> [备注]        收藏/取消收藏
word favs                     查看单词本
word history                  查词历史
word change                   切换难度
word list                     查看难度列表
word setup / status / -h      配置 / 查看状态 / 帮助
```

## 从源码构建

### 环境要求
- Node.js ≥ 18（用于构建，产物无需 Node）
- Windows 10/11 x64

### 步骤
```
npm install
node build.js          # 构建三个 exe 到 dist/
node build.js cmd      # 仅 tran.exe
node build.js word     # 仅 word.exe
node build.js gui      # 仅 translate_gui.exe
```

### 重新生成词典
词典数据来自 [ECDICT](https://github.com/skywind3000/ECDICT)（开源英汉词典）。
```
node build_dict.js     # 从 dictionary/ecdict.csv 生成 words.json
```
`dictionary/ecdict.csv` 是原始数据（60MB，77 万词），脚本会按词频提取前 5 万常用词生成 `words.json`（3.4MB）。

### 构建原理

| 产物 | 技术 |
| ---- | ---- |
| `tran.exe` | esbuild 打包 → Node SEA 单文件可执行 → rcedit 设图标 |
| `word.exe` | esbuild 打包（含内嵌词典） → Node SEA → rcedit 设图标 |
| `translate_gui.exe` | Electron 应用精简 → gzip 归档 → Node SEA 启动器自解压 → PE GUI 子系统 → rcedit 设图标 |

## 项目结构

```
TranslateAgent/
├── lib.js                # 共享核心：配置 / API 调用 / 词典搜索 / 历史记录 / 收藏
├── cli.js                # tran.exe 源码（翻译 CLI）
├── word.js               # word.exe 源码（单词 CLI）
├── word-entry.js         # word.exe 打包入口（内嵌词典）
├── build.js              # 打包脚本（esbuild + SEA + rcedit）
├── build_dict.js         # 词典生成脚本（ECDICT → words.json）
├── translate.jpg         # 图标原图
├── translate.ico         # exe 图标（多尺寸）
├── package.json
├── dictionary/
│   ├── ecdict.csv        # 原始词典数据（60MB，不提交，可重新下载）
│   ├── words.json        # 精简词典（5 万词，3.4MB）
│   └── words.bin         # V8 序列化格式（备用）
├── gui/
│   ├── main.js           # Electron 主进程
│   ├── preload.js        # Electron 预加载
│   ├── index.html        # GUI 页面
│   ├── renderer.js       # GUI 逻辑
│   └── app.ico           # 窗口图标
└── dist/                 # 构建产物
    ├── tran.exe
    ├── word.exe
    └── translate_gui.exe
```

## 技术说明

- **零运行时依赖**：产物用 Node SEA 打包，目标机无需安装 Node.js
- **本地词典内嵌**：word.exe 和 GUI 的词典嵌入 exe 内部，无需外部文件
- **无 HTTP 服务**：CLI 和 GUI 都直接调用翻译 API
- **流式输出**：word 查词的 AI 拓展部分流式输出，边生成边显示
- **请求取消**：GUI 单词查询支持实时中断旧请求（AbortController）
- **配置共享**：三个程序读写同一份 config.json
- **数据存储**：历史记录和单词本存在 exe 同目录的 data/ 文件夹

## License

MIT
