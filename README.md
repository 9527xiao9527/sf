# 顺丰速运 (APP)

## 配置 (QuanX)

```properties
[MITM]
hostname = ccsp-egmas.sf-express.com

[rewrite_local]
^https:\/\/ccsp-egmas.sf-express.com\/cx-app-member\/member\/app\/user\/universalSign url script-request-body https://raw.githubusercontent.com/9527xiao9527/sf/main/sfcookie.js
```

## 说明

1. 配置重写
2. `APP` 我的顺丰 > 积分
3. 提示 `获取会话: 成功`
4. 提取到的格式[{}}],青龙多账号格式[{}},{}},{}}]
