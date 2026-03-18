const $ = new Env('顺丰33周年庆活动')
$.KEY_login = 'chavy_login_sfexpress'

const ACTIVITY_CODE = 'ANNIVERSARY_2026'
const SKIP_TASK_TYPES = [
  'BUY_ADD_VALUE_SERVICE_PACKET',
  'SEND_INTERNATIONAL_PACKAGE',
  'LOOK_BIG_PACKAGE_GET_CASH',
  'SEND_SUCCESS_RECALL',
  'CHARGE_NEW_EXPRESS_CARD',
  'CHARGE_COLLECT_ALL',
  'OPEN_FAMILY_HOME_MUTUAL',
  'BUY_ANNIVERSARY_LIMITED_PACKET',
  'INTEGRAL_EXCHANGE',
]

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

    const result = { index: i + 1, phone: mobile, medals: [], tasksCompleted: 0 }
    $.allResults.push(result)

    // 登录
    const loginOk = await loginapp(account)
    if (!loginOk) {
      console.log(`❌ 账号${i + 1} 登录失败`)
      result.error = '登录失败'
      continue
    }
    await $.wait(1000)
    await loginweb()
    await $.wait(1000)

    await runActivity(result)

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
  // account 可以是 loginList 里的对象（{url,body,headers}），也可以是字符串（CK或URL）
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
  // 字符串格式（CK 或旧 URL）
  if (typeof account === 'string' && (account.startsWith('sessionId=') || account.includes('_login_mobile_='))) {
    $.login = { obj: { sign: '' }, _ckStr: account }
    return Promise.resolve(true)
  }
  console.log('❌ 未知账号格式')
  return Promise.resolve(false)
}

function loginweb() {
  // CK 格式直接跳过 loginweb
  if ($.login && $.login._ckStr) {
    return Promise.resolve()
  }
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

function getActivityIndex() {
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026IndexService~index')
}

function getTaskList() {
  return post(
    'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~activityTaskService~taskList',
    { activityCode: ACTIVITY_CODE, channelType: 'MINI_PROGRAM' }
  )
}

function finishTask(taskCode) {
  return post(
    'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask',
    { taskCode }
  )
}

function fetchTasksReward() {
  return post(
    'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026TaskService~fetchTasksReward',
    { channelType: 'MINI_PROGRAM', activityCode: ACTIVITY_CODE }
  )
}

function getCardStatus() {
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026CardService~cardStatus')
}

function claimMedal() {
  return post(
    'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026CardService~claim',
    { batchClaim: false }
  )
}

function getGuessTitleList() {
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026GuessService~titleList')
}

function submitGuessAnswer(answerInfo, period) {
  const body = { answerInfo }
  if (period) body.period = period
  return post('https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~anniversary2026GuessService~answer', body)
}

async function doGuessGame() {
  console.log('🎯 [对暗号赢免单] 开始...')
  const guessInfo = await getGuessTitleList()
  if (!guessInfo || !guessInfo.success) {
    console.log('⚠️ [对暗号] 获取题目列表失败')
    return false
  }

  const { currentPeriod, guessTitleInfoList: titleList = [] } = guessInfo.obj || {}
  if (!titleList.length) {
    console.log('⚠️ [对暗号] 题目列表为空')
    return false
  }

  titleList.sort((a, b) => (a.period > b.period ? 1 : -1))
  console.log(`📝 [对暗号] 共 ${titleList.length} 天题目，当前日期: ${currentPeriod}`)

  let anySuccess = false
  for (let i = 0; i < titleList.length; i++) {
    const title = titleList[i]
    const { period, answerStatus, answerInfo: apiAnswer = '', tip = '' } = title

    if (answerStatus === 1) {
      console.log(`✅ [对暗号] ${period} 已作答: ${apiAnswer}`)
      anySuccess = true
      continue
    }
    if (period > currentPeriod) {
      console.log(`📝 [对暗号] ${period} 尚未开放，跳过`)
      continue
    }

    // 优先用 API 返回的答案，没有则无法作答
    const answer = apiAnswer
    if (!answer) {
      console.log(`⚠️ [对暗号] ${period} 无法获取答案（提示: ${tip}）`)
      continue
    }

    console.log(`📝 [对暗号] ${period} 提交答案: ${answer}`)
    const resp = await submitGuessAnswer(answer, period)
    if (resp && resp.success) {
      await $.wait(1000)
      // 验证是否真的成功
      const verify = await getGuessTitleList()
      if (verify && verify.success) {
        const t = (verify.obj.guessTitleInfoList || []).find((x) => x.period === period)
        if (t && t.answerStatus === 1) {
          console.log(`✅ [对暗号] ${period} 验证通过，答案: ${t.answerInfo}`)
          anySuccess = true
        } else {
          console.log(`⚠️ [对暗号] ${period} 验证失败`)
        }
      }
    } else {
      const errMsg = resp ? resp.errorMessage : '请求失败'
      console.log(`❌ [对暗号] ${period} 提交失败: ${errMsg}`)
    }
    await $.wait(1000)
  }
  return anySuccess
}

async function doTasks(result) {
  console.log('📝 正在获取周年活动任务列表...')
  const resp = await getTaskList()
  if (!resp || !resp.success) {
    console.log(`❌ 获取任务列表失败: ${resp ? resp.errorMessage : '请求失败'}`)
    return
  }

  const tasks = resp.obj || []
  console.log(`📝 共发现 ${tasks.length} 个任务`)

  for (const task of tasks) {
    const {
      taskName = '未知',
      taskType = '',
      taskCode = '',
      status,
      process: progress = '',
      restFinishTime = 0,
      virtualTokenNum = 0,
      canReceiveTokenNum = 0,
    } = task

    // 已完成且已领奖，或已完成待领奖
    if (status === 3 || (status === 1 && restFinishTime <= 0)) {
      if (canReceiveTokenNum > 0) {
        console.log(`📝 [${taskName}] 已完成，待领取 ${canReceiveTokenNum} 次抽勋章机会`)
      } else {
        console.log(`✅ [${taskName}] 已完成 ${progress ? '(' + progress + ')' : ''}`)
      }
      continue
    }

    if (SKIP_TASK_TYPES.includes(taskType)) {
      console.log(`📝 [${taskName}] 需要实际操作，跳过`)
      continue
    }

    if (taskType === 'GUESS_GAME_TIP') {
      const ok = await doGuessGame()
      if (ok) result.tasksCompleted++
      continue
    }

    if (taskCode) {
      console.log(`🎯 [${taskName}] 尝试完成任务`)
      const r = await finishTask(taskCode)
      if (r && r.success) {
        console.log(`✅ [${taskName}] 完成成功，可获得 ${virtualTokenNum} 次抽勋章机会`)
        result.tasksCompleted++
      } else {
        const errMsg = r ? r.errorMessage : '请求失败'
        console.log(`⚠️ [${taskName}] 完成失败: ${errMsg}`)
      }
      await $.wait(1000)
    } else {
      console.log(`📝 [${taskName}] 无taskCode，跳过 (${taskType})`)
    }
  }
}

async function doFetchRewards() {
  console.log('📝 领取任务奖励...')
  await $.wait(1000)
  const resp = await fetchTasksReward()
  if (!resp || !resp.success) {
    const errMsg = resp ? resp.errorMessage : '请求失败'
    console.log(`⚠️ 领取任务奖励失败: ${errMsg}`)
    return
  }

  const received = resp.obj.receivedAccountList || []
  if (received.length) {
    for (const item of received) {
      console.log(`✅ 领取奖励: ${item.currency} x${item.amount} (来自: ${item.taskType || ''})`)
    }
  } else {
    console.log('📝 无新的任务奖励可领取')
  }

  // 累计任务进度
  const accrued = resp.obj.accruedTaskAward || {}
  const progress = accrued.currentProgress || 0
  const config = accrued.progressConfig || {}
  if (Object.keys(config).length) {
    const milestones = Object.entries(config)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => `${k}个任务得${v}次`)
      .join(', ')
    console.log(`📝 累计完成任务数: ${progress} (里程碑: ${milestones})`)
  }
}

async function doClaimMedals(result) {
  const statusResp = await getCardStatus()
  if (!statusResp || !statusResp.success) return

  const accounts = statusResp.obj.currentAccountList || []

  // 显示已有勋章
  const medalsOwned = accounts
    .filter((a) => a.currency !== 'CLAIM_CHANCE' && a.balance > 0)
    .map((a) => `${a.currency}x${a.balance}`)
  if (medalsOwned.length) {
    console.log(`🏅 已有勋章: ${medalsOwned.join(', ')}`)
  }

  let claimBalance = 0
  for (const acc of accounts) {
    if (acc.currency === 'CLAIM_CHANCE') claimBalance = acc.balance
  }
  console.log(`📝 当前可抽勋章次数: ${claimBalance}`)
  if (claimBalance <= 0) {
    console.log('📝 无抽勋章次数，跳过')
    return
  }

  console.log('📝 开始抽勋章...')
  let count = 0
  while (count < 30) {
    await $.wait(1000)
    const resp = await claimMedal()
    if (!resp || !resp.success) {
      const errMsg = resp ? resp.errorMessage : '请求失败'
      console.log(`❌ 抽勋章失败: ${errMsg}`)
      break
    }

    const received = resp.obj.receivedAccountList || []
    if (!received.length) {
      console.log('📝 没有抽到勋章或无抽取次数')
      break
    }

    for (const item of received) {
      console.log(`🏅 抽到勋章: ${item.currency} x${item.amount}`)
      result.medals.push(`${item.currency}x${item.amount}`)
    }
    count++

    claimBalance = 0
    for (const acc of resp.obj.currentAccountList || []) {
      if (acc.currency === 'CLAIM_CHANCE') claimBalance = acc.balance
    }
    console.log(`📝 剩余抽取次数: ${claimBalance}`)
    if (claimBalance <= 0) break
  }
  console.log(`📝 抽勋章完成，本次共抽取 ${count} 次`)
}

async function runActivity(result) {
  // 活动首页信息
  const indexResp = await getActivityIndex()
  if (indexResp && indexResp.success) {
    const obj = indexResp.obj || {}
    console.log(`📝 活动时间: ${obj.acStartTime} ~ ${obj.acEndTime}`)
    console.log(`📝 历史寄件数: ${obj.sendNum || 0}，累计支付: ${obj.payAmount || 0}元`)
  }

  await doTasks(result)
  await $.wait(1000)
  await doFetchRewards()
  await $.wait(1000)
  await doClaimMedals(result)
}

function showmsg() {
  const lines = []
  let totalMedals = 0

  for (const r of $.allResults) {
    const tag = `账号${r.index}`
    if (r.error) {
      lines.push(`${tag}: ${r.error}`)
    } else {
      const medals = r.medals.length ? r.medals.join(', ') : '无'
      lines.push(`${tag}: 完成${r.tasksCompleted}个任务，勋章: ${medals}`)
      totalMedals += r.medals.length
    }
  }

  $.msg(
    $.name,
    `共${ACCOUNTS.length}个账号，抽到${totalMedals}个勋章`,
    lines.join('\n')
  )
}

// prettier-ignore
function Env(t,e){class s{constructor(t){this.env=t}send(t,e="GET"){t="string"==typeof t?{url:t}:t;let s=this.get;return"POST"===e&&(s=this.post),new Promise((e,i)=>{s.call(this,t,(t,s,r)=>{t?i(t):e(s)})})}get(t){return this.send.call(this.env,t)}post(t){return this.send.call(this.env,t,"POST")}}return new class{constructor(t,e){this.name=t,this.http=new s(this),this.data=null,this.dataFile="box.dat",this.logs=[],this.isMute=!1,this.isNeedRewrite=!1,this.logSeparator="\n",this.startTime=(new Date).getTime(),Object.assign(this,e),this.log("",`\ud83d\udd14${this.name}, \u5f00\u59cb!`)}isNode(){return"undefined"!=typeof module&&!!module.exports}isQuanX(){return"undefined"!=typeof $task}isSurge(){return"undefined"!=typeof $httpClient&&"undefined"==typeof $loon}isLoon(){return"undefined"!=typeof $loon}isShadowrocket(){return"undefined"!=typeof $rocket}toObj(t,e=null){try{return JSON.parse(t)}catch{return e}}toStr(t,e=null){try{return JSON.stringify(t)}catch{return e}}getjson(t,e){let s=e;const i=this.getdata(t);if(i)try{s=JSON.parse(this.getdata(t))}catch{}return s}setjson(t,e){try{return this.setdata(JSON.stringify(t),e)}catch{return!1}}getScript(t){return new Promise(e=>{this.get({url:t},(t,s,i)=>e(i))})}runScript(t,e){return new Promise(s=>{let i=this.getdata("@chavy_boxjs_userCfgs.httpapi");i=i?i.replace(/\n/g,"").trim():i;let r=this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");r=r?1*r:20,r=e&&e.timeout?e.timeout:r;const[o,h]=i.split("@"),a={url:`http://${h}/v1/scripting/evaluate`,body:{script_text:t,mock_type:"cron",timeout:r},headers:{"X-Key":o,Accept:"*/*"}};this.post(a,(t,e,i)=>s(i))}).catch(t=>this.logErr(t))}loaddata(){if(!this.isNode())return{};{this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e);if(!s&&!i)return{};{const i=s?t:e;try{return JSON.parse(this.fs.readFileSync(i))}catch(t){return{}}}}}writedata(){if(this.isNode()){this.fs=this.fs?this.fs:require("fs"),this.path=this.path?this.path:require("path");const t=this.path.resolve(this.dataFile),e=this.path.resolve(process.cwd(),this.dataFile),s=this.fs.existsSync(t),i=!s&&this.fs.existsSync(e),r=JSON.stringify(this.data);s?this.fs.writeFileSync(t,r):i?this.fs.writeFileSync(e,r):this.fs.writeFileSync(t,r)}}lodash_get(t,e,s){const i=e.replace(/\[(\d+)\]/g,".$1").split(".");let r=t;for(const t of i)if(r=Object(r)[t],void 0===r)return s;return r}lodash_set(t,e,s){return Object(t)!==t?t:(Array.isArray(e)||(e=e.toString().match(/[^.[\]]+/g)||[]),e.slice(0,-1).reduce((t,s,i)=>Object(t[s])===t[s]?t[s]:t[s]=Math.abs(e[i+1])>>0==+e[i+1]?[]:{},t)[e[e.length-1]]=s,t)}getdata(t){let e=this.getval(t);if(/^@/.test(t)){const[,s,i]=/^@(.*?)\.(.*?)$/.exec(t),r=s?this.getval(s):"";if(r)try{const t=JSON.parse(r);e=t?this.lodash_get(t,i,""):e}catch(t){e=""}}return e}setdata(t,e){let s=!1;if(/^@/.test(e)){const[,i,r]=/^@(.*?)\.(.*?)$/.exec(e),o=this.getval(i),h=i?"null"===o?null:o||"{}":"{}";try{const e=JSON.parse(h);this.lodash_set(e,r,t),s=this.setval(JSON.stringify(e),i)}catch(e){const o={};this.lodash_set(o,r,t),s=this.setval(JSON.stringify(o),i)}}else s=this.setval(t,e);return s}getval(t){return this.isSurge()||this.isLoon()?$persistentStore.read(t):this.isQuanX()?$prefs.valueForKey(t):this.isNode()?(this.data=this.loaddata(),this.data[t]):this.data&&this.data[t]||null}setval(t,e){return this.isSurge()||this.isLoon()?$persistentStore.write(t,e):this.isQuanX()?$prefs.setValueForKey(t,e):this.isNode()?(this.data=this.loaddata(),this.data[e]=t,this.writedata(),!0):this.data&&this.data[e]||null}initGotEnv(t){this.got=this.got?this.got:require("got"),this.cktough=this.cktough?this.cktough:require("tough-cookie"),this.ckjar=this.ckjar?this.ckjar:new this.cktough.CookieJar,t&&(t.headers=t.headers?t.headers:{},void 0===t.headers.Cookie&&void 0===t.cookieJar&&(t.cookieJar=this.ckjar))}get(t,e=(()=>{})){t.headers&&(delete t.headers["Content-Type"],delete t.headers["Content-Length"]),this.isSurge()||this.isLoon()?(this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient.get(t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)})):this.isQuanX()?(this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t))):this.isNode()&&(this.initGotEnv(t),this.got(t).on("redirect",(t,e)=>{try{if(t.headers["set-cookie"]){const s=t.headers["set-cookie"].map(this.cktough.Cookie.parse).toString();s&&this.ckjar.setCookieSync(s,null),e.cookieJar=this.ckjar}}catch(t){this.logErr(t)}}).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)}))}post(t,e=(()=>{})){const s=t.method?t.method.toLocaleLowerCase():"post";if(t.body&&t.headers&&!t.headers["Content-Type"]&&(t.headers["Content-Type"]="application/x-www-form-urlencoded"),t.headers&&delete t.headers["Content-Length"],this.isSurge()||this.isLoon())this.isSurge()&&this.isNeedRewrite&&(t.headers=t.headers||{},Object.assign(t.headers,{"X-Surge-Skip-Scripting":!1})),$httpClient[s](t,(t,s,i)=>{!t&&s&&(s.body=i,s.statusCode=s.status),e(t,s,i)});else if(this.isQuanX())t.method=s,this.isNeedRewrite&&(t.opts=t.opts||{},Object.assign(t.opts,{hints:!1})),$task.fetch(t).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>e(t));else if(this.isNode()){this.initGotEnv(t);const{url:i,...r}=t;this.got[s](i,r).then(t=>{const{statusCode:s,statusCode:i,headers:r,body:o}=t;e(null,{status:s,statusCode:i,headers:r,body:o},o)},t=>{const{message:s,response:i}=t;e(s,i,i&&i.body)})}}time(t,e=null){const s=e?new Date(e):new Date;let i={"M+":s.getMonth()+1,"d+":s.getDate(),"H+":s.getHours(),"m+":s.getMinutes(),"s+":s.getSeconds(),"q+":Math.floor((s.getMonth()+3)/3),S:s.getMilliseconds()};/(y+)/.test(t)&&(t=t.replace(RegExp.$1,(s.getFullYear()+"").substr(4-RegExp.$1.length)));for(let e in i)new RegExp("("+e+")").test(t)&&(t=t.replace(RegExp.$1,1==RegExp.$1.length?i[e]:("00"+i[e]).substr((""+i[e]).length)));return t}msg(e=t,s="",i="",r){const o=t=>{if(!t)return t;if("string"==typeof t)return this.isLoon()?t:this.isQuanX()?{"open-url":t}:this.isSurge()?{url:t}:void 0;if("object"==typeof t){if(this.isLoon()){let e=t.openUrl||t.url||t["open-url"],s=t.mediaUrl||t["media-url"];return{openUrl:e,mediaUrl:s}}if(this.isQuanX()){let e=t["open-url"]||t.url||t.openUrl,s=t["media-url"]||t.mediaUrl;return{"open-url":e,"media-url":s}}if(this.isSurge()){let e=t.url||t.openUrl||t["open-url"];return{url:e}}}};if(this.isMute||(this.isSurge()||this.isLoon()?$notification.post(e,s,i,o(r)):this.isQuanX()&&$notify(e,s,i,o(r))),!this.isMuteLog){let t=["","==============\ud83d\udce3\u7cfb\u7edf\u901a\u77e5\ud83d\udce3=============="];t.push(e),s&&t.push(s),i&&t.push(i),console.log(t.join("\n")),this.logs=this.logs.concat(t)}}log(...t){t.length>0&&(this.logs=[...this.logs,...t]),console.log(t.join(this.logSeparator))}logErr(t,e){const s=!this.isSurge()&&!this.isQuanX()&&!this.isLoon();s?this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t.stack):this.log("",`\u2757\ufe0f${this.name}, \u9519\u8bef!`,t)}wait(t){return new Promise(e=>setTimeout(e,t))}done(t={}){const e=(new Date).getTime(),s=(e-this.startTime)/1e3;this.log("",`\ud83d\udd14${this.name}, \u7ed3\u675f! \ud83d\udd5b ${s} \u79d2`),this.log(),(this.isSurge()||this.isQuanX()||this.isLoon())&&$done(t)}}(t,e)}
