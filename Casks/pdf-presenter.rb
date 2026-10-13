cask "pdf-presenter" do
  arch arm: "-arm64", intel: ""

  version "1.2.9"
  sha256 arm:   "5ab1ac61674a0cdaa8b673374f5fde2b1c1956a55ac3066c567ea77d05f53f9b",
         intel: "85a4d84c912daf173e9f3b9ff0fb00c7f3749d704576f2336cd167261e0ff924"

  url "https://github.com/SHARUNJOSEPH/pdf-presenter/releases/download/v#{version}/PDF.Presenter.Suite-#{version}#{arch}.dmg"
  name "PDF Presenter Suite"
  desc "Offline-first dual-window PDF presentation and display control suite"
  homepage "https://github.com/SHARUNJOSEPH/pdf-presenter"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false

  app "PDF Presenter Suite.app"

  zap trash: [
    "~/Library/Application Support/pdf-presenter",
    "~/Library/Logs/pdf-presenter",
    "~/Library/Preferences/com.sharunjoseph.pdfpresenter.plist",
    "~/Library/Saved Application State/com.sharunjoseph.pdfpresenter.savedState",
  ]
end
