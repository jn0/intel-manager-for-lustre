import inspect
import logging
import os
import paramiko
import time

from django.utils.unittest import TestCase

from testconfig import config

from tests.integration.core.constants import TEST_TIMEOUT

logger = logging.getLogger('test')
logger.setLevel(logging.DEBUG)
handler = logging.FileHandler(os.path.join(config.get('log_dir', '/var/log/'), 'chroma_test.log'))
handler.setLevel(logging.DEBUG)
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
handler.setFormatter(formatter)
logger.addHandler(handler)

# paramiko.transport logger spams nose log collection so we're quieting it down
paramiko_logger = logging.getLogger('paramiko.transport')
paramiko_logger.setLevel(logging.WARN)


class RemoteCommandResult(object):
    """
    Conveniently stores the various output of a remotely executed command.
    """

    def __init__(self, exit_status, stdout, stderr, *args, **kwargs):
        super(RemoteCommandResult, self).__init__(*args, **kwargs)
        self.exit_status = exit_status
        self.stdout = stdout
        self.stderr = stderr


class UtilityTestCase(TestCase):
    """
    Adds a few non-api specific utility functions for the integration tests.
    """

    def assertEqual(self, obj1, obj2, msg=None, proof=None):
        equal = super(UtilityTestCase, self).assertEqual(obj1, obj2, msg=msg)
        if proof and not equal:
            proof()
        return equal

    def assertLess(self, obj1, obj2, msg=None, proof=None):
        less = super(UtilityTestCase, self).assertLess(obj1, obj2, msg=msg)
        if proof and not less:
            proof()
        return less

    def remote_command(self, server, command, expected_return_code=0, timeout=TEST_TIMEOUT):
        """
        Executes a command on a remote server over ssh.

        Sends a command over ssh to a remote machine and returns the stdout,
        stderr, and exit status. It will verify that the exit status of the
        command matches expected_return_code unless expected_return_code=None.
        """
        logger.debug("remote_command[%s]: %s" % (server, command))
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect(server, **{'username': 'root'})
        transport = ssh.get_transport()
        transport.set_keepalive(20)
        channel = transport.open_session()
        channel.settimeout(timeout)
        channel.exec_command(command)
        stdout = channel.makefile('rb')
        stderr = channel.makefile_stderr()
        exit_status = channel.recv_exit_status()
        if expected_return_code is not None:
            self.assertEqual(exit_status, expected_return_code, stderr.read())
        return RemoteCommandResult(exit_status, stdout, stderr)

    def wait_until_true(self, lambda_expression, timeout=TEST_TIMEOUT, proof = None):
        """
        Evaluates lambda_expression once/1s until True or hits timeout.
        """
        running_time = 0
        lambda_result = None
        while not lambda_result and running_time < timeout:
            lambda_result = lambda_expression()
            logger.debug("%s evaluated to %s" % (inspect.getsource(lambda_expression), lambda_result))
            time.sleep(1)
            running_time += 1
        self.assertLess(running_time, timeout, "Timed out waiting for %s." % inspect.getsource(lambda_expression), proof = proof)

    def wait_for_assert(self, lambda_expression, timeout=TEST_TIMEOUT):
        """
        Evaluates lambda_expression once/1s until no AssertionError or hits
        timeout.
        """
        running_time = 0
        while running_time < timeout:
            try:
                lambda_expression()
            except AssertionError, e:
                logger.debug("%s tripped assertion: %s" % (inspect.getsource(lambda_expression), e))
            else:
                break
            time.sleep(1)
            running_time += 1
        self.assertLess(running_time, timeout, "Timed out waiting for %s." % inspect.getsource(lambda_expression))

    def get_host_config(self, nodename):
        """
        Get the entry for a lustre server from the cluster config.
        """
        for host in config['lustre_servers']:
            if host['nodename'] == nodename:
                return host
