/* 项目配置（进 git，不含密钥）。
   真实密钥放在 config.local.js，那个文件已被 .gitignore 忽略。
   设置页里填的 Key 存在浏览器本地，优先级最高。 */
window.APP_CONFIG = {
  // 默认留空；本地开发时由 config.local.js 提供
  deepseekKey: '',
  // 默认模型：deepseek-chat（快）/ deepseek-reasoner（推理强，慢）
  model: 'deepseek-chat',
  // API 网关；若浏览器直连被跨域拦截，可换成你自己的代理地址
  baseURL: 'https://api.deepseek.com',
  // 联网检索：纯前端无法直接抓取裁判文书网等站点（跨域 + 反爬），
  // 这里预置权威源的搜索入口，一键带着关键词打开；真内容建议粘贴/导入原文由 AI 提炼。
  sources: [
    { name: '中国裁判文书网', url: 'https://wenshu.court.gov.cn/website/wenshu/181217BMTKHNT2W0/index.html?pageId={q}', free: true },
    { name: '人民法院案例库', url: 'https://rmfyalk.court.gov.cn/', free: true },
    { name: '最高法 · 指导性案例', url: 'https://www.court.gov.cn/zixun-xiangqing-{q}.html', free: true },
    { name: '国家知识产权局', url: 'https://www.cnipa.gov.cn/', free: true },
    { name: '知产宝', url: 'https://www.iphouse.cn/', free: false },
    { name: '北大法宝', url: 'https://www.pkulaw.com/', free: false },
    { name: '威科先行', url: 'https://law.wkinfo.com.cn/', free: false },
    { name: '无讼案例', url: 'https://www.itslaw.com/', free: false },
    { name: '北京知识产权法院', url: 'https://bjzcfy.chinacourt.gov.cn/', free: true },
    { name: '上海知识产权法院', url: 'https://shzcfy.chinacourt.gov.cn/', free: true },
    { name: '广州知识产权法院', url: 'https://gz.zcfy.gov.cn/', free: true },
    { name: '知产力', url: 'https://www.zhichanli.com/', free: true },
    { name: 'IPRdaily', url: 'https://www.iprdaily.cn/', free: true }
  ]
};
