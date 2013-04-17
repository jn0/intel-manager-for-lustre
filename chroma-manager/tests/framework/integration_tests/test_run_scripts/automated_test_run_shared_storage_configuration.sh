#!/bin/sh -e

set -x

spacelist_to_commalist() {
    echo $@ | tr ' ' ','
}

[ -r localenv ] && . localenv

# Remove test results and coverate reports from previous run
rm -rfv ~/ss/test_reports/*
rm -rfv ~/ss/coverage_reports/.coverage*
mkdir -p ~/ss/test_reports
mkdir -p ~/ss/coverage_reports

CLUSTER_CONFIG=${CLUSTER_CONFIG:-"`ls ~/ss/shared_storage_configuration_cluster_cfg.json`"}
CHROMA_DIR=${CHROMA_DIR:-$PWD}
set +x
CHROMA_REPO=${CHROMA_REPO:-"https://jenkins-pull:Aitahd9u@build.whamcloudlabs.com/job/chroma/lastSuccessfulBuild/arch=x86_64%2Cdistro=el6/artifact/chroma-dependencies/repo/"}

eval $(python $CHROMA_DIR/chroma-manager/tests/utils/json_cfg2sh.py "$CLUSTER_CONFIG")

set -x
MEASURE_COVERAGE=${MEASURE_COVERAGE:-true}
TESTS=${TESTS:-"tests/integration/shared_storage_configuration/"}
PROXY=${PROXY:-''} # Pass in a command that will set your proxy settings iff the cluster is behind a proxy. Ex: PROXY="http_proxy=foo https_proxy=foo"

echo "Beginning installation and setup..."

# Configure repos on test nodes
trap "pdsh -l root -R ssh -S -w $(spacelist_to_commalist $CHROMA_MANAGER ${STORAGE_APPLIANCES[@]} $CLIENT_1) 'rm -rf /etc/yum.repos.d
mv /etc/yum.repos.d{.bak,}' | dshbak -c" EXIT

set +x
pdsh -l root -R ssh -S -w $(spacelist_to_commalist $CHROMA_MANAGER ${STORAGE_APPLIANCES[@]} $CLIENT_1) "set -ex
mv /etc/yum.repos.d{,.bak}
mkdir /etc/yum.repos.d/
cat <<\"EOF1\" > /etc/yum.repos.d/test-run.repo
# CentOS-Base.repo
#
# The mirror system uses the connecting IP address of the client and the
# update status of each mirror to pick mirrors that are updated to and
# geographically close to the client.  You should use this for CentOS updates
# unless you are manually picking other mirrors.
#
# If the mirrorlist= does not work for you, as a fall back you can try the
# remarked out baseurl= line instead.
#
#

[base]
name=CentOS-\$releasever - Base
mirrorlist=http://mirrorlist.centos.org/?release=\$releasever&arch=\$basearch&repo=os
#baseurl=http://mirror.centos.org/centos/\$releasever/os/\$basearch/
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-CentOS-6

#released updates
[updates]
name=CentOS-\$releasever - Updates
mirrorlist=http://mirrorlist.centos.org/?release=\$releasever&arch=\$basearch&repo=updates
#baseurl=http://mirror.centos.org/centos/\$releasever/updates/\$basearch/
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-CentOS-6

#additional packages that may be useful
[extras]
name=CentOS-\$releasever - Extras
mirrorlist=http://mirrorlist.centos.org/?release=\$releasever&arch=\$basearch&repo=extras
#baseurl=http://mirror.centos.org/centos/\$releasever/extras/\$basearch/
gpgcheck=1
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-CentOS-6

#additional packages that extend functionality of existing packages
[centosplus]
name=CentOS-\$releasever - Plus
mirrorlist=http://mirrorlist.centos.org/?release=\$releasever&arch=\$basearch&repo=centosplus
#baseurl=http://mirror.centos.org/centos/\$releasever/centosplus/\$basearch/
gpgcheck=1
enabled=0
gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-CentOS-6

#contrib - packages by Centos Users
[contrib]
name=CentOS-\$releasever - Contrib
mirrorlist=http://mirrorlist.centos.org/?release=\$releasever&arch=\$basearch&repo=contrib
#baseurl=http://mirror.centos.org/centos/\$releasever/contrib/\$basearch/
gpgcheck=1
enabled=0
EOF1
$PROXY yum clean all
$PROXY yum -y install pdsh || true" 2>&1 | dshbak -c

set -x

# Install and setup integration tests on integration test runner
scp $CLUSTER_CONFIG $CLIENT_1:/root/cluster_cfg.json
ssh $CLIENT_1 <<EOF
cat <<\"EOF1\" >> /etc/yum.repos.d/test-run.repo

[chroma-jenkins]
name=chroma-jenkins
baseurl=$CHROMA_REPO
gpgcheck=0
sslverify=0
enable=1
#gpgkey=file:///etc/pki/rpm-gpg/RPM-GPG-KEY-WhamOS-6
EOF1

$PROXY yum -y install python-{requests,nose-testconfig,paramiko,django,dateutil}
cd /usr/share/chroma-manager
unset http_proxy; unset https_proxy
nosetests --verbosity=2 tests/integration/utils/full_cluster_reset.py --tc-format=json --tc-file=/root/cluster_cfg.json
cd
$PROXY yum remove -y chroma-manager*
rm -rf /usr/share/chroma-manager/
logrotate -fv /etc/logrotate.d/syslog
rm -f /var/log/chroma_test.log
$PROXY yum install -y chroma-manager-integration-tests
EOF

# Install and setup chroma software storage appliances
pdsh -l root -R ssh -S -w $(spacelist_to_commalist ${STORAGE_APPLIANCES[@]}) "service chroma-agent stop
cat <<\"EOF\"  > /etc/logrotate.d/chroma-agent
compress

/var/log/chroma*.log {
        missingok
        rotate 10
        nocreate
        size=10M
}
EOF
logrotate -fv /etc/logrotate.d/chroma-agent
logrotate -fv /etc/logrotate.d/syslog

set -xe
$PROXY yum remove -y chroma-agent*
rm -f /var/tmp/.coverage*
if $MEASURE_COVERAGE; then
    $PROXY yum install -y python-coverage
    cat <<\"EOF\" > /usr/lib/python2.6/site-packages/chroma_agent/.coveragerc
[run]
data_file = /var/tmp/.coverage
parallel = True
source = /usr/lib/python2.6/site-packages/chroma_agent/
EOF
    cat <<\"EOF\" > /usr/lib/python2.6/site-packages/sitecustomize.py
import coverage
cov = coverage.coverage(config_file='/usr/lib/python2.6/site-packages/chroma_agent/.coveragerc', auto_data=True)
cov.start()
cov._warn_no_data = False
cov._warn_unimported_source = False
EOF
else
    # Ensure that coverage is disabled
    rm -f /usr/lib/python2.6/site-packages/sitecustomize.py*
fi" 2>&1 | dshbak -c

# Install and setup chroma manager
ssh $CHROMA_MANAGER <<"EOF"
set -ex
chroma-config stop
$PROXY yum remove -y chroma-manager*
service postgresql stop
rm -fr /var/lib/pgsql/data/*

logrotate -fv /etc/logrotate.d/chroma-manager
logrotate -fv /etc/logrotate.d/syslog
logrotate -fv /etc/logrotate.d/rabbitmq-server

cd /tmp
tar xzvf /home/brian/chroma/chroma-bundles/chroma.tar.gz
# TODO: need to get this info from the cluster_config.json
./install.sh <<EOF1
chroma
brian.murrell@intel.com
chroma
chroma
localhost
EO1

cat <<"EOF1" > /usr/share/chroma-manager/local_settings.py
import logging
LOG_LEVEL = logging.DEBUG
EOF1

rm -f /var/tmp/.coverage*
if $MEASURE_COVERAGE; then
    $PROXY yum install -y python-coverage
    cat <<"EOF1" > /usr/share/chroma-manager/.coveragerc
[run]
data_file = /var/tmp/.coverage
parallel = True
source = /usr/share/chroma-manager/
EOF1
    cat <<"EOF1" > /usr/lib/python2.6/site-packages/sitecustomize.py
import coverage
cov = coverage.coverage(config_file='/usr/share/chroma-manager/.coveragerc', auto_data=True)
cov.start()
cov._warn_no_data = False
cov._warn_unimported_source = False
EOF1
else
    # Ensure that coverage is disabled
    rm -f /usr/lib/python2.6/site-packages/sitecustomize.py*
fi
EOF

echo "End installation and setup."

set +e
set -x

echo "Begin running tests..."

ssh $CLIENT_1 <<EOF
rm -f /root/test_report.xml
cd /usr/share/chroma-manager/
unset http_proxy; unset https_proxy
./tests/integration/run_tests -f -c /root/cluster_cfg.json -x ~/test_report.xml $TESTS
EOF
integration_test_status=$?

echo "End running tests."
echo "Collecting logs and reports..."

scp $CLIENT_1:~/test_report.xml ~/ss/test_reports/

if $MEASURE_COVERAGE; then
    ssh $CHROMA_MANAGER chroma-config stop

    pdsh -l root -R ssh -S -w $(spacelist_to_commalist $CHROMA_MANAGER ${STORAGE_APPLIANCES[@]}) "set -x
      rm -f /usr/lib/python2.6/site-packages/sitecustomize.py*
      cd /var/tmp/
      coverage combine" | dshbak -c

    rpdcp -l root -R ssh -w $CHROMA_MANAGER ${STORAGE_APPLIANCES[@]} /var/tmp/.coverage ~/ss/coverage_reports/

    ssh $CHROMA_MANAGER chroma-config start
fi

if [ $integration_test_status -ne 0 ]; then
    echo "AUTOMATED TEST RUN FAILED"
fi

exit $integration_test_status
