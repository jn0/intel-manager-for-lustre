//
// INTEL CONFIDENTIAL
//
// Copyright 2013-2014 Intel Corporation All Rights Reserved.
//
// The source code contained or described herein and all documents related
// to the source code ("Material") are owned by Intel Corporation or its
// suppliers or licensors. Title to the Material remains with Intel Corporation
// or its suppliers and licensors. The Material contains trade secrets and
// proprietary and confidential information of Intel or its suppliers and
// licensors. The Material is protected by worldwide copyright and trade secret
// laws and treaty provisions. No part of the Material may be used, copied,
// reproduced, modified, published, uploaded, posted, transmitted, distributed,
// or disclosed in any way without Intel's prior express written permission.
//
// No license under any patent, copyright, trade secret or other intellectual
// property right is granted to or conferred upon you by disclosure or delivery
// of the Materials, either expressly, by implication, inducement, estoppel or
// otherwise. Any license under such intellectual property rights must be
// express and approved by Intel in writing.


'use strict';

var bunyan = require('bunyan'),
  path = require('path'),
  Logger = require('bunyan/lib/bunyan');

exports.wiretree = function loggerFactory (conf) {
  var logPath, level;

  if (conf.isProd) {
    logPath = '/var/log/chroma';
    level = 'info';
  } else {
    logPath = '';
    level = 'debug';
  }

  return bunyan.createLogger({
    name: 'realtime',
    serializers: {
      err: Logger.stdSerializers.err
    },
    streams: [
      {
        type: 'stream',
        level: level,
        stream: process.stdout
      },
      {
        type: 'file',
        level: level,
        path: path.join(logPath, 'realtime.log')
      }
    ]
  });
};
