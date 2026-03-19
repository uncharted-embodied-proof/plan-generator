#!/bin/bash

################################################################################
# Test dockerized nodejs box
################################################################################

# Build the docker image
docker build -t sandbox-demo .


# Example: send JS code via STDIN
echo '
plans[0]
' | docker run -i --network=none sandbox-demo


# Example: send JS code via STDIN
# echo '
# function sleep(ms) {
#   return new Promise(resolve => setTimeout(resolve, ms));
# }
# 
# await sleep(5000)
# return plans[0]
# ' | docker run -i --network=none sandbox-demo
