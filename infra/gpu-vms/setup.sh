#!/bin/bash
apt-get update
apt-get install -y nvidia-driver-535
# Clone the repository and setup worker
git clone https://github.com/UlisesCasal/pilar2-blockchain.git /opt/blockchain
cd /opt/blockchain
npm install
# Startup script would then run the worker via PM2 or systemd
echo "Worker setup complete" > /var/log/setup.log
