cask "pdf-presenter" do
  arch arm: "-arm64", intel: ""

  version "1.2.10"
  sha256 arm:   "4b8c9dd09db70d1f0b481286aa4454cb0ae75964ea81dba052a9a527cdaa0e22",
         intel: "2d1bf4576bba09f0cfe4a78ff54fd58c0f7e489530a8653cc3f00c27cb795259"

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
