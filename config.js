const os = require("os");
const path = require("path");

var config = {};

var ip = os.platform()=='linux'?'46.101.231.40':'127.0.0.1'; //lets assume linux=server, others=local
config.port = process.env.OS_PORT || 7777; //an arbitrary port for node app
config.svr_proto = 'http';
config.svr_ip = ip;
config.svr_name = ip+':7777';
config.domain_name = ip+':7777';
config.app_url = config.svr_proto + '://' + config.domain_name;
config.app_logo = config.app_url+'/assets/img/convilogo.svg';

config.display=false; //if its a remote server and has mo physical display

config.app_root = path.sep+"root"+path.sep+"convi"; //value for linux by default
config.assets = path.sep+"root"+path.sep+"convi_warehouse";
config.snaps_dir = config.assets+path.sep+"snapshots";
config.vid_out = config.assets+path.sep+"vid_out";
config.vid_intro = config.assets+path.sep+'intro';
config.vid_bubble = config.assets+path.sep+'bubbles';
config.vid_supp = config.assets+path.sep+'supps';
config.vid_outtro = config.assets+path.sep+'outtro';
config.temp_upload = config.assets+path.sep+'temps';
config.failures = config.assets+path.sep+"failures";
config.failsafe = config.assets+path.sep+"failsafe";
config.downloads = config.assets+path.sep+"downloads"+path.sep+"reports";

config.segment_prefix = 'supplementary_';
config.extension = './extension/istilldontcareaboutcookies.crx';

config.email_templates = {
    error:'',
    noti:'/root/convi/emtem/noti/index.html',
    thanks:'',
};

//browser
config.chrome_path = '/usr/bin/google-chrome'; //value for linux by default
//if (os.platform()=='darwin') config.chrome_path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
//if (os.platform()=='win32') config.chrome_path = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
config.user_agent = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.60 Safari/537.36';   

//main server & links
config.service_root = "https://convi.io";
config.get_data_link = config.service_root+"/onelead";
config.secret = "Adfsdflk23234AJAIadsflkLKA9823498";
config.scont = 'convi2412';
config.cookie_prefix='convi_';
config.cookie_age = 365*20*24*60;
config.ppce_link = config.app_url+'/ppce';
config.loom_login = "https://www.loom.com/login";
config.loom_uplink = "https://www.loom.com/home";
config.max_wait = 30; //second
config.min_wait = 10; //second

//mongodb
config.db_host = 'localhost';
config.db_port = 27017;
config.db_user = 'root';
config.db_pass = '1234';
config.db_name = 'convi';

module.exports = config;