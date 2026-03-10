 #!/bin/bash
 API="http://121.41.176.166"

 # 登录
 echo "登录中..."
 RESPONSE=$(curl -s -X POST $API/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"123","password":"123456"}')

 TOKEN=$(echo $RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
 echo "Token: $TOKEN"

 # 查看用户
 echo -e "\n=== 所有用户 ==="
 curl -s -H "Authorization: Bearer $TOKEN" $API/api/admin/users | python3 -m json.tool

 # 删除用户 (取消注释使用)
 # curl -s -X DELETE -H "Authorization: Bearer $TOKEN" $API/api/admin/users/<USER_ID>

#  使用方式：
#  chmod +x admin.sh
#  ./admin.sh