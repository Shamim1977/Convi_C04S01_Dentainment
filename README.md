## Generate SSH key (to create droplet and access via ssh/console with. It's given here in Dox folder.)
ssh-keygen
Save both privte and public key
(Use public key to create new DO droplet)
Create ppk with filezilla from private key for remote access
the password for the ppk I generate and put in folder 'asset' is: Wxyz1234


## Keep new ip:
46.101.231.40 (found on dashboard after creation)


## Fix ports (if cannot be accessed normally via filezilla)

```
sudo nano /etc/ssh/sshd_config
uncomment port 22
(change it if 22 does not work)

sudo ufw allow 22/tcp
sudo ufw allow 7777/tcp
sudo service ssh restart
```

## Install NodeJS

```
sudo apt update
(sudo apt-get purge --auto-remove nodejs)
curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt install nodejs
sudo apt install npm

Check version:
node -v
npm -v
```

## Create project directory

```
cd
mkdir convi
mkdir convi_warehouse
mkdir Downloads
```

## Project scripts
Upload project files to: /root/convi (or wherever)

```
cd /root/convi
npm i
npm i -g pm2
```

## Update 100kb to 50mb or whatever in files under "node_modules > body-parser > lib > types"

```
json.js
raw.js
text.js
urlencoded.js
```

## Check if Python3 installed, should be

```
python3 -V

#update pip
cd
apt install python3-pip
pip install matplotlib
```

## install google chrome

```
cd
sudo apt install gdebi
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo dpkg -i google-chrome-stable_current_amd64.deb
sudo apt install -f
```

## MongoDB

```
sudo apt-get install gnupg
wget -qO - https://www.mongodb.org/static/pgp/server-4.4.asc | sudo apt-key add -
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/4.4 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-4.4.list
sudo apt-get update
wget http://archive.ubuntu.com/ubuntu/pool/main/o/openssl/libssl1.1_1.1.0g-2ubuntu4_amd64.deb
sudo dpkg -i libssl1.1_1.1.0g-2ubuntu4_amd64.deb
sudo apt-get install -y mongodb-org
echo "mongodb-org hold" | sudo dpkg --set-selections
echo "mongodb-org-server hold" | sudo dpkg --set-selections
echo "mongodb-org-shell hold" | sudo dpkg --set-selections
echo "mongodb-org-mongos hold" | sudo dpkg --set-selections
echo "mongodb-org-tools hold" | sudo dpkg --set-selections
ps --no-headers -o comm 1
sudo systemctl start mongod
sudo systemctl daemon-reload
sudo systemctl status mongod
sudo systemctl enable mongod
```

**Other**

```
mongo
use admin
db.createUser({
 user: "root",
 pwd: "1234",
 roles: [{ role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase"]
 });
 ```


## create new db:

```
use convi
```

Create collection:
db.createCollection('coll_sys_col_map');
db.createCollection('coll_sys_leads');

## Reroute port 7777 to 80

### Open rc.local

```
cd
sudo nano /etc/rc.local
```

### Paste the following lines in it

```
#!/bin/bash
iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT &
iptables -A INPUT -i eth0 -p tcp --dport 7777 -j ACCEPT &
iptables -A PREROUTING -t nat -i eth0 -p tcp --dport 80 -j REDIRECT --to-port 7777
```

### Make rc.local executable

```
sudo chmod a+x /etc/rc.local
```

## Virtual display & Sound:

```
sudo apt-get update
sudo apt-get install -y xvfb
sudo apt-get -y install xorg xvfb gtk2-engines-pixbuf
sudo apt-get -y install dbus-x11 xfonts-base xfonts-100dpi xfonts-75dpi xfonts-cyrillic xfonts-scalable
sudo apt-get -y install imagemagick x11-apps
webm:
sudo apt-get update
sudo apt-get install -y libvpx-dev
mp3:
sudo apt-get update
sudo apt-get install -y lame
```

## install ffmpeg and wrapper for node

```
apt install ffmpeg
ffmpeg -version
```


## Start server

```
cd /root/convi
sudo pm2 start app.js
sudo pm2 save
sudo pm2 startup 
reboot
```


## Server Status:

```
[http://46.101.231.40](http://46.101.231.40)
```

## Access Admin Site:

```
[https://convi.io](https://convi.io)
Dent2023
#Joel23400
```

http://46.101.231.40/readleads