"""An INSECURE configuration for Jupyter Server, intended only for mybinder.org."""

# Copyright (c) Jupyter Development Team.
# Distributed under the terms of the Modified BSD License.
import logging

common = [
    "--no-browser",
    "--debug",
    "--port={port}",
    "--ServerApp.ip=127.0.0.1",
    '--IdentityProvider.token=""',
    # Disable dns rebinding protection here, since our 'Host' header
    # is not going to be localhost when coming from hub.mybinder.org
    "--ServerApp.allow_remote_access=True",
]


lab_splice_command = " ".join(
    [
        "jupyter",
        "lab",
        "build",
        "--splice-source",
        "--minimize=False",
        "--dev-build=True",
        "--debug",
        ">jupyterlab-spliced.log 2>&1",
        "&&",
        "jupyter",
        "lab",
        "--ServerApp.base_url={base_url}lab-spliced",
        *common,
        ">jupyterlab-spliced.log 2>&1",
    ]
)


c.ServerProxy.servers = {
    "lab-spliced": {
        "command": ["/bin/bash", "-c", lab_splice_command],
        "timeout": 300,
        "absolute_url": True,
    },
}

c.ServerApp.log_level = logging.DEBUG

c.LabApp.dev_mode = True
c.LabApp.extensions_in_dev_mode = True
c.LabApp.skip_dev_build = True

c.ContentsManager.allow_hidden = True
