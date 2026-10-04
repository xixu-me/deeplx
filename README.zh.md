# DeepLX

***[English](README.md)***

[![许可证](https://img.shields.io/github/license/xixu-me/deeplx)](./LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange?logo=cloudflare)](#self-deployment)

DeepLX 是一个专为 Cloudflare Workers 优化的无服务器翻译服务。通过智能代理端点轮换、高级限流算法、缓存和熔断器机制，它比传统翻译 API 接入方式更能避免 HTTP 429 错误，同时带来更低的延迟。当前同时支持 DeepL 和 Google 翻译。

> [!NOTE]
> 与付费翻译 API 不同，DeepLX 可以免费使用。无需 API 密钥、无需订阅，也没有按量计费。

## 为什么选择 DeepLX

**与付费翻译 API 不同，DeepLX 完全免费使用** - 无需 API 密钥、无订阅费用、无使用限制。只需部署一次，即可享受无限制的翻译请求，无需担心任何费用问题。

## 特性与性能优势

### 多服务提供商支持

- **DeepL 翻译** (`/deepl`) - 高质量的 AI 翻译
- **Google 翻译** (`/google`) - 广泛的语言支持和快速处理
- **传统兼容性** (`/translate`) - 使用 DeepL 的向后兼容端点

### 性能优势

DeepLX 在性能和稳定性方面相较于 DeepL API 有显著提升，以下是基于特定网络环境下的关键指标对比：

| 指标 | DeepL API | DeepLX (预部署实例) |
|------|-----------|-------------------|
| 速率限制 | 50 请求/秒 | 80 请求/秒 (8 请求/秒 × 10 代理端点) |
| 平均网络往返时间 | ~450ms | ~180ms (边缘网络加速) |
| HTTP 429 错误率 | 10-30% | <1% |
| 并发支持 | 单端点限制 | 多端点负载均衡 |
| 地理分布 | 有限 | 全球 330+ 边缘节点 |

#### 核心性能特性

- **更高速率限制**：智能负载均衡，比 DeepL API 支持更高的并发请求
- **更低延迟**：基于 Cloudflare Workers 的全球边缘网络部署
- **零冷启动**：无服务器架构，瞬时响应
- **智能缓存**：双层缓存系统（内存 + KV 存储）减少重复请求

#### 技术优势

- **智能负载均衡**：多个代理端点自动分发请求
- **动态限流算法**：基于代理数量自动调整速率限制
- **双层缓存系统**：内存缓存 + KV 存储减少重复请求
- **熔断器机制**：故障端点自动切换，保证服务连续性
- **边缘计算**：Cloudflare Workers 全球部署，降低延迟

### 稳定性保障

- **避免 HTTP 429 错误**：通过代理端点轮换和令牌桶算法几乎完全避免限流
- **熔断器机制**：自动检测故障端点并进行故障转移
- **指数退避重试**：智能重试机制提高成功率

### 安全特性

- **可选的 API 密钥身份验证**：默认关闭，设置 `API_KEYS` 后启用
- **输入验证**：全面的参数校验和文本清理
- **速率限制**：基于客户端 IP 和代理端点的多维度限流
- **CORS 支持**：灵活的跨域资源共享配置
- **安全头部**：自动添加安全相关的 HTTP 头部
- **错误净化**：敏感信息永不暴露

## 架构概览

```mermaid
graph TB
    %% 客户端层
    subgraph "客户端层"
        Client[API 客户端]
    end

    %% Cloudflare Workers 层
    subgraph "Cloudflare Workers"
        direction TB
        Router[Hono 路由器]
        
        subgraph "API 端点"
            DeepL[POST /deepl]
            Google[POST /google]
            Translate[POST /translate]
            Debug[POST /debug]
        end
        
        subgraph "核心中间件与组件"
            CORS[CORS 处理器]
            Security[安全中间件]
            RateLimit[限流系统]
            Cache[双层缓存<br/>内存 + KV]
        end
        
        subgraph "翻译服务"
            QueryEngine[DeepL 查询引擎]
            GoogleService[Google 翻译服务]
        end
        
        subgraph "支持系统"
            ProxyManager[代理管理器<br/>& 负载均衡]
            CircuitBreaker[熔断器]
            RetryLogic[重试逻辑]
            ErrorHandler[错误处理器]
        end
    end

    %% 存储层
    subgraph "Cloudflare 存储"
        CacheKV[(缓存 KV<br/>翻译结果)]
        RateLimitKV[(限流 KV<br/>令牌桶)]
        Analytics[(分析引擎<br/>指标 & 监控)]
    end

    %% 外部服务
    subgraph "外部翻译 API"
        DeepLAPI[DeepL JSONRPC API<br/>www2.deepl.com]
        GoogleAPI[Google 翻译 API<br/>translate.google.com]
        XDPL[XDPL 代理集群<br/>多个 Vercel 实例]
    end

    %% 请求流连接
    Client --> Router
    Router --> CORS
    CORS --> DeepL
    CORS --> Google
    CORS --> Translate
    CORS --> Debug
    
    DeepL --> Security
    Google --> Security
    Translate --> Security
    Debug --> Security
    
    Security --> RateLimit
    RateLimit --> Cache
    
    Cache --> QueryEngine
    Cache --> GoogleService
    
    QueryEngine --> ProxyManager
    GoogleService --> GoogleAPI
    
    ProxyManager --> CircuitBreaker
    CircuitBreaker --> RetryLogic
    RetryLogic --> ErrorHandler
    
    %% 外部 API 连接
    ProxyManager -.-> XDPL
    XDPL -.-> DeepLAPI
    
    %% 存储连接
    Cache -.-> CacheKV
    RateLimit -.-> RateLimitKV
    Router -.-> Analytics

    %% 样式
    classDef clientClass fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef workerClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef middlewareClass fill:#e8f5e8,stroke:#388e3c,stroke-width:2px
    classDef serviceClass fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef storageClass fill:#fce4ec,stroke:#e91e63,stroke-width:2px
    classDef externalClass fill:#ffebee,stroke:#d32f2f,stroke-width:2px

    class Client clientClass
    class Router,DeepL,Google,Translate,Debug workerClass
    class CORS,Security,RateLimit,Cache middlewareClass
    class QueryEngine,GoogleService,ProxyManager,CircuitBreaker,RetryLogic,ErrorHandler serviceClass
    class CacheKV,RateLimitKV,Analytics storageClass
    class DeepLAPI,GoogleAPI,XDPL externalClass
```

## 在线服务

> [!WARNING]
> 预部署实例因请求过多已暂时停止服务。请[自行部署](#self-deployment)以继续使用。

~~**预部署实例**：`https://dplx.xi-xu.me`~~ （暂时停止）

## 快速开始

### cURL 示例

#### DeepL 翻译（推荐）

```bash
curl -X POST https://dplx.xi-xu.me/deepl \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "source_lang": "EN",
    "target_lang": "ZH"
  }'
```

#### Google 翻译

```bash
curl -X POST https://dplx.xi-xu.me/google \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "source_lang": "EN",
    "target_lang": "ZH"
  }'
```

#### 传统端点（DeepL）

```bash
curl -X POST https://dplx.xi-xu.me/translate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello, world!",
    "source_lang": "EN",
    "target_lang": "ZH"
  }'
```

### JavaScript 示例

#### DeepL 翻译（JavaScript）

```javascript
async function translateWithDeepL(text, sourceLang = 'auto', targetLang = 'zh') {
  const response = await fetch('https://dplx.xi-xu.me/deepl', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      source_lang: sourceLang,
      target_lang: targetLang
    })
  });
  
  const result = await response.json();
  return result.data;
}

// 使用示例
translateWithDeepL('Hello, world!', 'en', 'zh')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

#### Google 翻译（JavaScript）

```javascript
async function translateWithGoogle(text, sourceLang = 'auto', targetLang = 'zh') {
  const response = await fetch('https://dplx.xi-xu.me/google', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: text,
      source_lang: sourceLang,
      target_lang: targetLang
    })
  });
  
  const result = await response.json();
  return result.data;
}

// 使用示例
translateWithGoogle('Hello, world!', 'en', 'zh')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### Python 示例

#### DeepL 翻译（Python）

```python
import requests
import json

def translate_with_deepl(text, source_lang='auto', target_lang='zh'):
    url = 'https://dplx.xi-xu.me/deepl'
    data = {
        'text': text,
        'source_lang': source_lang,
        'target_lang': target_lang
    }
    
    response = requests.post(url, json=data)
    result = response.json()
    
    if result['code'] == 200:
        return result['data']
    else:
        raise Exception(f"翻译失败: {result.get('message', '未知错误')}")

# 使用示例
try:
    result = translate_with_deepl('Hello, world!', 'en', 'zh')
    print(result)
except Exception as e:
    print(f"错误: {e}")
```

#### Google 翻译（Python）

```python
import requests
import json

def translate_with_google(text, source_lang='auto', target_lang='zh'):
    url = 'https://dplx.xi-xu.me/google'
    data = {
        'text': text,
        'source_lang': source_lang,
        'target_lang': target_lang
    }
    
    response = requests.post(url, json=data)
    result = response.json()
    
    if result['code'] == 200:
        return result['data']
    else:
        raise Exception(f"翻译失败: {result.get('message', '未知错误')}")

# 使用示例
try:
    result = translate_with_google('Hello, world!', 'en', 'zh')
    print(result)
except Exception as e:
    print(f"错误: {e}")
```

## 客户端集成

配置 API 客户端以使用预部署实例：

### [DeepLX App](https://github.com/xixu-me/DeepLX-App)（开源 web 应用）

一个现代化、免费的基于 web 的翻译应用，由 DeepLX API 驱动。功能包括：

- 支持多语言自动检测
- 输入时自动翻译
- 翻译历史和语言切换
- 适配所有设备的响应式设计
- RTL 语言支持

**在线演示**：[https://deeplx.xi-xu.me](https://deeplx.xi-xu.me)

### [Pot](https://github.com/pot-app/pot-desktop)（开源跨平台 Windows、macOS 和 Linux 应用）

1. [下载并安装适用于您平台的 Pot](https://github.com/pot-app/pot-desktop/releases/latest)
2. 打开 Pot 设置并导航到服务设置
3. 将 DeepL 服务类型配置为 DeepLX，并将自定义 URL 配置为 `https://dplx.xi-xu.me/deepl`

### [Zotero](https://www.zotero.org/)（开源文献管理应用）

1. [下载并安装适用于您平台的 Zotero](https://www.zotero.org/download/)
2. 下载并安装 [Translate for Zotero](https://github.com/windingwind/zotero-pdf-translate) 插件
3. 打开 Zotero 设置并导航到翻译中的服务部分
4. 将翻译服务配置为 DeepLX（API），并点击配置按钮后将接口配置为 `https://dplx.xi-xu.me/deepl`

### [PDFMathTranslate（pdf2zh）](https://github.com/Byaidu/PDFMathTranslate)（开源 PDF 文档翻译工具）

参考[高级选项](https://github.com/Byaidu/PDFMathTranslate/blob/main/docs/README_zh-CN.md#%E9%AB%98%E7%BA%A7%E9%80%89%E9%A1%B9)和[使用不同的服务进行翻译](https://github.com/Byaidu/PDFMathTranslate/blob/main/docs/ADVANCED.md#translate-with-different-services)。

### [沉浸式翻译](https://immersivetranslate.com/zh-Hans/)（闭源浏览器扩展）

1. [安装沉浸式翻译](https://immersivetranslate.com/zh-Hans/download/)
2. 进入开发者设置并开启 beta 测试特性
3. 进入翻译服务添加自定义翻译服务 DeepLX，将 API URL 配置为 `https://dplx.xi-xu.me/deepl`
4. 将每秒最大请求数和每次请求最大文本长度配置为合适的值（例如 `80` 和 `5000`），以确保稳定性和性能

### [Bob](https://bobtranslate.com/)（闭源 macOS 应用）

1. [从 Mac App Store 下载并安装 Bob](https://apps.apple.com/cn/app/id1630034110)
2. 下载并安装 [bob-plugin-deeplx](https://github.com/missuo/bob-plugin-deeplx) 插件
3. 配置插件使用 `https://dplx.xi-xu.me/deepl`

## 自部署

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/xixu-me/DeepLX)

### 前置要求

- Node.js 18+
- Cloudflare Workers 账户
- Wrangler CLI

### 1. 克隆存储库

```bash
git clone https://github.com/xixu-me/DeepLX.git
cd DeepLX
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境

编辑 `wrangler.jsonc` 文件，更新以下配置：

```jsonc
{
  "account_id": "你的_CLOUDFLARE_账户_ID",
  "name": "你的_Worker_名称",
  "vars": {
    "DEBUG_MODE": "false",
    "PROXY_URLS": "你的代理端点列表,用逗号分隔"
  }
}
```

### 4. 创建 KV 命名空间

```bash
# 创建缓存 KV 命名空间
npx wrangler kv namespace create "CACHE_KV"

# 创建限流 KV 命名空间  
npx wrangler kv namespace create "RATE_LIMIT_KV"
```

将返回的命名空间 ID 更新到 `wrangler.jsonc` 的 `kv_namespaces` 配置中。

### 5. 部署到 Cloudflare Workers

```bash
# 开发环境
npx wrangler dev

# 生产部署
npx wrangler deploy
```

## 代理端点部署

为了获得最佳性能和稳定性，建议部署尽可能多的 [XDPL](https://github.com/xixu-me/XDPL) 代理端点：

### 快速部署 XDPL

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/xixu-me/XDPL)

### 配置代理端点

1. 部署多个 XDPL 实例
2. 将部署后的 URL 添加到 DeepLX 的 `PROXY_URLS` 环境变量中：

```jsonc
{
  "vars": {
    "PROXY_URLS": "https://your-xdpl-1.vercel.app/jsonrpc,https://your-xdpl-2.vercel.app/jsonrpc,https://your-xdpl-3.vercel.app/jsonrpc,https://your-xdpl-n.vercel.app/jsonrpc"
  }
}
```

## API 参考

### 可用端点

| 端点 | 服务提供商 | 描述 | 状态 |
|----------|----------|-------------|---------|
| `/deepl` | DeepL | 主要 DeepL 翻译端点 | **推荐** |
| `/google` | Google 翻译 | Google 翻译端点 | 活跃 |
| `/translate` | DeepL | 传统端点（使用 DeepL） | 传统 |

### `/deepl`（推荐）

**请求方法**：`POST`

**请求标头**：`Content-Type: application/json`

**请求参数**：

| 参数 | 类型 | 说明 | 是否必要 |
| - | - | - | - |
| `text`        | string | 要翻译的文本 | 是 |
| `source_lang` | string | 源语言代码 | 否，默认值 `AUTO` |
| `target_lang` | string | 目标语言代码 | 否，默认值 `EN` |

**响应**：

```json
{
  "code": 200,
  "data": "翻译结果",
  "id": "随机标识符",
  "source_lang": "检测到的源语言代码",
  "target_lang": "目标语言代码"
}
```

### `/google`

**请求方法**：`POST`

**请求标头**：`Content-Type: application/json`

**请求参数**：

| 参数 | 类型 | 说明 | 是否必要 |
| - | - | - | - |
| `text`        | string | 要翻译的文本 | 是 |
| `source_lang` | string | 源语言代码 | 否，默认值 `AUTO` |
| `target_lang` | string | 目标语言代码 | 否，默认值 `EN` |

**响应**：

```json
{
  "code": 200,
  "data": "翻译结果",
  "id": "随机标识符",
  "source_lang": "检测到的源语言代码",
  "target_lang": "目标语言代码"
}
```

### `/translate`（传统）

**请求方法**：`POST`

**请求标头**：`Content-Type: application/json`

> [!NOTE]
> 这是一个使用 DeepL 的传统端点。对于新集成，请使用 `/deepl`。

**请求参数**：

| 参数 | 类型 | 说明 | 是否必要 |
| - | - | - | - |
| `text`        | string | 要翻译的文本 | 是 |
| `source_lang` | string | 源语言代码 | 否，默认值 `AUTO` |
| `target_lang` | string | 目标语言代码 | 否，默认值 `EN` |

**响应**：

```json
{
  "code": 200,
  "data": "翻译结果",
  "id": "随机标识符",
  "source_lang": "检测到的源语言代码",
  "target_lang": "目标语言代码"
}
```

**支持的语言代码**：

- `AUTO` - 自动检测（仅作为源语言）
- `AR` - 阿拉伯语
- `BG` - 保加利亚语
- `CS` - 捷克语
- `DA` - 丹麦语
- `DE` - 德语
- `EL` - 希腊语
- `EN` - 英语
- `ES` - 西班牙语
- `ET` - 爱沙尼亚语
- `FI` - 芬兰语
- `FR` - 法语
- `HE` - 希伯来语
- `HU` - 匈牙利语
- `ID` - 印尼语
- `IT` - 意大利语
- `JA` - 日语
- `KO` - 韩语
- `LT` - 立陶宛语
- `LV` - 拉脱维亚语
- `NB` - 挪威博克马尔语
- `NL` - 荷兰语
- `PL` - 波兰语
- `PT` - 葡萄牙语
- `RO` - 罗马尼亚语
- `RU` - 俄语
- `SK` - 斯洛伐克语
- `SL` - 斯洛文尼亚语
- `SV` - 瑞典语
- `TH` - 泰语
- `TR` - 土耳其语
- `UK` - 乌克兰语
- `VI` - 越南语
- `ZH` - 汉语

最新的语言支持列表请参考[支持的语言 - DeepL 文档](https://developers.deepl.com/docs/getting-started/supported-languages#translation-source-languages)。

### `/debug`（仅在 `DEBUG_MODE=true` 时可用）

**请求方法**：`POST`

用于验证请求格式和排查问题。

### 错误代码

| 代码 | 说明 |
|------|------|
| 200 | 翻译成功 |
| 400 | 请求参数错误 |
| 401 | 缺少或无效的 API 密钥（仅在设置 `API_KEYS` 时） |
| 429 | 请求频率过高 |
| 500 | 服务器内部错误 |
| 503 | 服务暂时不可用 |

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `DEBUG_MODE` | 调试模式开关 | `false` |
| `PROXY_URLS` | 代理端点列表，逗号分隔 | 无 |
| `API_KEYS` | 接受的 API 密钥，逗号分隔。未设置则不启用身份验证 | 无 |

### 可选的 API 密钥身份验证

DeepLX 默认不需要身份验证，不设置 `API_KEYS` 即保持这一行为。设置该变量后，
所有端点都需要身份验证。这对部署在公开域名上的自建实例很有用：开放的翻译端点
等同于任何人都能使用的 API，而这些流量正是导致你的部署被上游服务商限流的原因。

请将密钥存储为 Secret，而不是明文变量：

```bash
npx wrangler secret put API_KEYS
```

客户端可以使用以下任一方式提供密钥：

```bash
curl -X POST https://your-domain.workers.dev/deepl \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "source_lang": "EN", "target_lang": "ZH"}'

curl -X POST https://your-domain.workers.dev/deepl \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello, world!", "source_lang": "EN", "target_lang": "ZH"}'
```

支持以逗号分隔的多个密钥，因此可以在不轮换其他客户端密钥的情况下吊销某个客户端。
未提供有效密钥的请求将收到 HTTP 401。

### 性能配置

可在 `src/lib/config.ts` 中调整：

```typescript
// 请求超时时间
export const REQUEST_TIMEOUT = 10000; // 10秒

// 重试配置
export const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,              // 最大重试次数
  initialDelay: 1000,         // 初始延迟
  backoffFactor: 2,          // 退避因子
};

// 限流配置
export const RATE_LIMIT_CONFIG = {
  PROXY_TOKENS_PER_SECOND: 8,    // 每代理每秒令牌数
  PROXY_MAX_TOKENS: 16,          // 代理最大令牌数
  BASE_TOKENS_PER_MINUTE: 480,   // 基础每分钟令牌数
};

// 负载限制
export const PAYLOAD_LIMITS = {
  MAX_TEXT_LENGTH: 5000,         // 最大文本长度
  MAX_REQUEST_SIZE: 32768,       // 最大请求大小
};
```

## 开发

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 使用 Wrangler 启动本地开发环境 |
| `npm run deploy` | 部署到 Cloudflare Workers |
| `npm run cf-typegen` | 生成 Cloudflare Workers 类型定义 |
| `npm run lint` | 执行 TypeScript 类型检查 |
| `npm test` | 运行完整测试套件 |

## 测试

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行性能测试
npm run test:performance

# 生成覆盖率报告
npm run test:coverage
```

## 故障排除

### 常见问题

#### 1. HTTP 429 错误仍然频繁出现

- 检查代理端点配置是否正确
- 增加代理端点数量
- 调整限流配置

#### 2. 翻译结果不准确

- 确认源语言检测正确
- 检查文本编码是否正确
- 验证语言代码格式

#### 3. 部署失败

- 检查 Cloudflare 账户配置
- 验证 KV 命名空间是否创建
- 确认 wrangler.jsonc 配置正确

### 调试模式

启用调试模式获取详细信息：

```jsonc
{
  "vars": {
    "DEBUG_MODE": "true"
  }
}
```

然后使用调试端点：

```bash
curl -X POST https://your-domain.workers.dev/debug \
  -H "Content-Type: application/json" \
  -d '{"text": "test", "source_lang": "EN", "target_lang": "ZH"}'
```

## 项目信息

### 致谢

- [OwO-Network/DeepLX](https://github.com/OwO-Network/DeepLX) - 原始实现，基于 Go 编程语言
- [Cloudflare Workers](https://workers.cloudflare.com/) - 托管平台
- [Hono](https://hono.dev/) - 快速 Web 框架
- [XDPL](https://github.com/xixu-me/XDPL) - 代理端点解决方案

### 参与项目

我们欢迎各种形式的贡献！请查看[贡献指南](CONTRIBUTING.md)了解如何参与存储库开发。

1. **报告问题**: 使用 [issue 模板](https://github.com/xixu-me/DeepLX/issues/new/choose)报告 bug 或提出功能请求
2. **提交代码**: fork 存储库，创建功能分支，提交 pull request
3. **改进文档**: 修正错误、添加示例、完善说明
4. **测试反馈**: 在不同环境下测试并提供反馈

仓库协作细节请参考 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### Star 历史

<a href="https://www.star-history.com/#xixu-me/DeepLX&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=xixu-me/DeepLX&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=xixu-me/DeepLX&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=xixu-me/DeepLX&type=Date" />
 </picture>
</a>

### 联系方式

- **作者**: [Xi Xu](https://xi-xu.me)
- **邮箱**: [联系邮箱](mailto:i@xi-xu.me)
- **赞助**: [赞助链接](https://xi-xu.me/#sponsorships)

### 免责声明

本存储库仅供学习和研究目的使用。使用本存储库时，请遵守以下条款：

### 使用条款

1. **合规使用**：用户有责任确保使用本存储库符合当地法律法规和相关服务条款
2. **商业使用**：商业使用前请确认是否符合 DeepL 的服务条款和使用政策
3. **服务稳定性**：本存储库依赖第三方服务，不保证 100% 的服务可用性
4. **数据隐私**：翻译内容会通过第三方服务处理，请勿翻译敏感或机密信息

### 责任限制

- 作者不对使用本存储库造成的任何直接或间接损失承担责任
- 用户应自行承担使用风险，包括但不限于服务中断、数据丢失等
- 本存储库不提供任何形式的担保，包括适销性、特定用途适用性等

### 服务条款

使用本存储库即表示您同意：

- 不将本存储库用于任何非法或有害目的
- 不滥用服务或进行恶意攻击
- 遵守合理使用原则，避免对服务造成过度负载

**请在充分理解并同意上述条款后使用本存储库。**

### 项目说明

本存储库采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

---

<div align="center">

**如果这个存储库对您有帮助，请考虑给它一个 ⭐ star！**

Made with ❤️ by [Xi Xu](https://xi-xu.me)

</div>
