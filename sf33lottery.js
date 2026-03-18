const $ = new Env('顺丰33周年庆抽奖')
$.KEY_login = 'chavy_login_sfexpress'

// 5种勋章（集齐才能抽大奖）
const CARD_CURRENCIES = ['FA_CAI', 'GAN_FAN', 'GAO_YA', 'KAI_XIANG', 'DAN_GAO']
const CARD_NAMES = {
  FA_CAI: '马上有钱',
  GAN_FAN: '全能吃货',
  GAO_YA: '高雅人士',
  KAI_XIANG: '拆箱达人',
  DAN_GAO: '甜度超标',
}

// 多账号：从 chavy_login_sfexpress_list 读取，& 分隔的 sfsyUrl 作为备用
const _loginList = $.getjson('chavy_login_sfexpress_list') || []
const ACCOUNTS = _loginList.length ? _loginList : ($.getdata('sfsyUrl') || '').split('&').map(s => s.trim()).filter(Boolean)

!(async () => {
  $.allResults = []

  for (let i = 0; i < ACCOUNTS.length; i++) {
    const account = ACCOUNTS[i]
    let mobile = ''
    if (typeof account === 'object') {
      try { mobile = JSON.parse(account.body).mobile || '' } catch (e) {}
    }

    console.log(`\n${'='.repeat(50)}`)
    console.log(`👤 账号 ${i + 1} / ${ACCOUNTS.length}${mobile ? ' (' + mobile + ')' : ''}`)
    console.log('='.repeat(50))

    const result = { index: i + 1, phone: mobile, prizes: [], drawCount: 0 }
    $.allResults.push(result)

    const loginOk = await loginapp(account)
    if (!loginOk) {
      console.log(`❌ 账号${i + 1} 登录失败`)
      result.error = '登录失败'
      continue
    }
    await $.wait(1000)
    await loginweb()
    await $.wait(1000)

    await runLottery(result)

    if (i < ACCOUNTS.length - 1) {
      console.log('⏳ 等待2秒后执行下一个账号...')
      await $.wait(2000)
    }
  }

  showmsg()
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done())

function loginapp(account) {
  if (typeof account === 'object' && account.url) {
    const opts = Object.assign({}, account)
    delete opts.headers.Cookie
    return $.http
      .post(opts)
      .then((resp) => {
        $.login = JSON.parse(resp.body)
        return true
      })
      .catch((err) => {
        console.log(`❌ loginapp 失败: ${err}`)
        return false
      })
  }
  if (typeof account === 'string' && (account.startsWith('sessionId=') || account.includes('_login_mobile_='))) {
    $.login = { obj: { sign: '' }, _ckStr: account }
    return Promise.resolve(true)
  }
  console.log('❌ 未知账号格式')
  return Promise.resolve(false)
}

function loginweb() {
  if ($.login && $.login._ckStr) return Promise.resolve()
  const sign = encodeURIComponent($.login.obj.sign)
  return $.http.get({
    url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/share/app/shareRedirect?sign=${sign}&source=SFAPP&bizCode=647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw==`
  })
}

function post(url, body) {
  return $.http
    .post({ url, body: JSON.stringify(body || {}), headers: { 'Content-Type': 'application/json' } })
    .then((resp) => JSON.parse(resp.body))
    .catch(() => null)
}

function getCardStatus() {
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026CardService~cardStatus')
}

function getPrizePool() {
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026LotteryService~prizePool')
}

function prizeDraw() {
  return post(
    'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026LotteryService~prizeDraw',
    { currencyList: CARD_CURRENCIES }
  )
}

function getBalances(cardStatusObj) {
  const balances = {}
  for (const acc of cardStatusObj.currentAccountList || []) {
    if (CARD_CURRENCIES.includes(acc.currency)) {
      balances[acc.currency] = acc.balance || 0
    }
  }
  return balances
}

function canDraw5(balances) {
  return CARD_CURRENCIES.every((c) => (balances[c] || 0) >= 1)
}

function formatCards(balances) {
  return CARD_CURRENCIES.map((c) => `${CARD_NAMES[c]}:${balances[c] || 0}`).join(' | ')
}

async function runLottery(result) {
  const statusResp = await getCardStatus()
  if (!statusResp || !statusResp.success) {
    console.log('❌ 获取勋章状态失败')
    return
  }

  let balances = getBalances(statusResp.obj)
  console.log(`🎴 ${formatCards(balances)}`)

  const remainSets = statusResp.obj.remainCardSet || 0
  console.log(`📊 可抽大奖次数(5卡): ${remainSets}`)

  if (!canDraw5(balances)) {
    console.log('⚠️ 勋章不足5种，无法抽奖')
    return
  }

  // 查看5卡奖品池信息
  const poolResp = await getPrizePool()
  if (poolResp && poolResp.success) {
    for (const p of poolResp.obj || []) {
      if (p.shouldNum === 5) {
        console.log(`🎰 5卡奖池: 已抽${p.lotteryNum}/${p.limitLotteryNum}次`)
      }
    }
  }

  // 循环抽奖直到勋章不足
  while (canDraw5(balances)) {
    await $.wait(1000 + Math.floor(Math.random() * 1000))

    const resp = await prizeDraw()
    if (!resp || !resp.success) {
      const errMsg = resp ? resp.errorMessage : '请求失败'
      console.log(`❌ 抽奖失败: ${errMsg}`)
      break
    }

    result.drawCount++
    const { giftBagName = '未知奖品', giftBagWorth = 0, giftBagDesc = '' } = resp.obj || {}
    console.log(`🎲 第${result.drawCount}次 → 🎉 ${giftBagName} (价值${giftBagWorth}元)`)
    if (giftBagDesc) console.log(`   📋 ${giftBagDesc}`)
    result.prizes.push({ name: giftBagName, worth: giftBagWorth })

    await $.wait(1000)
    const newStatus = await getCardStatus()
    if (!newStatus || !newStatus.success) break
    balances = getBalances(newStatus.obj)
    if (!canDraw5(balances)) {
      console.log(`🎴 ${formatCards(balances)} → 勋章不足，结束`)
    }
  }

  console.log(`📊 本账号共抽奖 ${result.drawCount} 次`)
}

function showmsg() {
  const lines = []
  let totalDraws = 0
  let totalWorth = 0
  const allPrizes = []

  for (const r of $.allResults) {
    const tag = `账号${r.index}`
    if (r.error) {
      lines.push(`${tag}: ${r.error}`)
    } else if (!r.prizes.length) {
      lines.push(`${tag}: 勋章不足，未抽奖`)
    } else {
      for (const p of r.prizes) {
        lines.push(`${tag}: 🎉 ${p.name} (${p.worth}元)`)
        allPrizes.push(p)
        totalWorth += p.worth
      }
      totalDraws += r.drawCount
    }
  }

  const subt = `共${ACCOUNTS.length}账号，抽${totalDraws}次，总价值${totalWorth}元`
  $.msg($.name, subt, lines.join('\n'))
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
