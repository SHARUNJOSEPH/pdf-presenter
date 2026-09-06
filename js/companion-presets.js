/**
 * js/companion-presets.js
 * 
 * Generates Bitfocus Companion 3.x compatible Page Configuration (.companionconfig)
 * Allows AV operators to import a ready-to-use 15-key Stream Deck layout in 1 click.
 */

function generateCompanionConfig(host = '127.0.0.1', port = 3000) {
  const baseUrl = `http://${host}:${port}/api`;

  const config = {
    version: 3,
    type: 'page',
    page: {
      name: 'PDF Presenter Suite',
      gridSize: {
        minColumn: 0,
        maxColumn: 7,
        minRow: 0,
        maxRow: 3
      }
    },
    controls: {
      // Key 0: Previous Slide (Blue)
      "0,0": {
        type: "button",
        style: {
          text: "◀ PREV\\nSLIDE",
          size: "14",
          color: 16777215, // White
          bgcolor: 1339690 // Dark Blue #1471aa
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/prev`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 1: Next Slide (Green - Large primary button)
      "0,1": {
        type: "button",
        style: {
          text: "NEXT ▶\\nSLIDE",
          size: "18",
          color: 16777215, // White
          bgcolor: 2337624 // Emerald Green #23aa58
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/next`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 2: Blackout Screen (Black / Amber)
      "0,2": {
        type: "button",
        style: {
          text: "⬛ BLACK\\nSCREEN",
          size: "14",
          color: 16777215,
          bgcolor: 0 // Pitch Black
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/blackout`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 3: Whiteout Screen (White / Gray)
      "0,3": {
        type: "button",
        style: {
          text: "⬜ WHITE\\nSCREEN",
          size: "14",
          color: 0,
          bgcolor: 16777215 // Pure White
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/blank`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 4: First Slide
      "0,4": {
        type: "button",
        style: {
          text: "⏮ FIRST\\nSLIDE",
          size: "14",
          color: 16777215,
          bgcolor: 3355443 // Dark Charcoal
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/first`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 5: Last Slide
      "0,5": {
        type: "button",
        style: {
          text: "⏭ LAST\\nSLIDE",
          size: "14",
          color: 16777215,
          bgcolor: 3355443
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/last`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 6: Timer Start / Pause
      "1,0": {
        type: "button",
        style: {
          text: "⏱️ TIMER\\nPLAY/PAUSE",
          size: "13",
          color: 16777215,
          bgcolor: 11141320 // Purple
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/timer/toggle`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 7: Timer Reset
      "1,1": {
        type: "button",
        style: {
          text: "🔄 TIMER\\nRESET",
          size: "13",
          color: 16777215,
          bgcolor: 7895160 // Gray
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/timer/reset`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 8: Laser Pointer Toggle
      "1,2": {
        type: "button",
        style: {
          text: "🔴 LASER\\nPOINTER",
          size: "13",
          color: 16777215,
          bgcolor: 11141120 // Red
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/laser/toggle`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      },
      // Key 9: Presenter Fullscreen Toggle
      "1,3": {
        type: "button",
        style: {
          text: "⛶ FULL\\nSCREEN",
          size: "13",
          color: 16777215,
          bgcolor: 3355443
        },
        steps: [
          {
            action_sets: {
              down: [
                {
                  action: "generic-http:post",
                  options: {
                    url: `${baseUrl}/fullscreen`,
                    body: "{}",
                    header: "Content-Type: application/json"
                  }
                }
              ],
              up: []
            }
          }
        ]
      }
    }
  };

  return JSON.stringify(config, null, 2);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateCompanionConfig };
}
