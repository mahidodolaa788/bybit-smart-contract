# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

# Bybit AML Verification System

## Deployment Instructions

### Prerequisites
- Ubuntu/Debian VPS with root access
- Domain name pointing to your server (optional but recommended)
- Node.js 14+ and npm installed

### Server Setup

1. Clone the repository:
```bash
git clone <your-repo-url>
cd bybit-aml-system
```

2. Make the deployment script executable:
```bash
chmod +x deploy.sh
```

3. Update nginx.conf:
- Replace `your-domain.com` with your actual domain
- If you don't have a domain, you can use your server's IP address

4. Run the deployment script:
```bash
./deploy.sh
```

### SSL Setup (Optional but Recommended)

1. Install Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
```

2. Obtain SSL certificate:
```bash
sudo certbot --nginx -d your-domain.com
```

3. Certbot will automatically update nginx configuration

### Maintenance

- Monitor backend logs: `pm2 logs bybit-aml`
- Restart backend: `pm2 restart bybit-aml`
- View backend status: `pm2 status`
- Nginx logs: `/var/log/nginx/error.log`

### Security Considerations

1. Configure firewall:
```bash
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```

2. Set up regular updates:
```bash
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Troubleshooting

1. Check nginx status:
```bash
sudo systemctl status nginx
```

2. Check backend status:
```bash
pm2 status
```

3. View nginx error logs:
```bash
sudo tail -f /var/log/nginx/error.log
```

4. View backend logs:
```bash
pm2 logs bybit-aml
```
