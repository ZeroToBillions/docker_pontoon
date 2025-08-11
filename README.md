# Pontoon Game in Dockor

1. 下载所有的文件放到NAS的Docker文件夹中（比如Docker\Pontoon）
2. 设置docker-compose.yml中MySQL的root用户密码，同步修改healthcheck的密码
3. 设置docker-compose.yml中MySQL的pontoon用户密码
4. 运行远程开启NAS的SSH，并登陆
5. cd到Docker\Pontoon，启动docker运行sudo docker-compose up -d
6. 开启网页http://Nas ip:8080，即可开始使用。
7. 登录phpMyAdmin管理数据库，登录http://Nas ip:8081
8. 远程管理数据库，地址：Nas ip，端口：3307
9. 以上端口如有冲突，请修改docker-compose.yml中的ports设置
10. 停止docker运行sudo docker-compose down
