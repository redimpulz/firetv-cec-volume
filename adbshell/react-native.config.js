module.exports = {
    dependency: {
        platforms: {
            kepler: {
                "autolink": {
                    "adbshell": {
                        "libraryName": "libadbshell.so",
                        "linkDynamic": true,
                        "provider": "application",
                        "components": [],
                        "turbomodules": [
                            "adbshell"
                        ]
                    }
                }
            },
        },
    },
};