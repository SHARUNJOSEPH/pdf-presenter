cask "pdf-presenter" do
  arch arm: "-arm64", intel: ""

  version "1.2.10"
  sha256 :no_check

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
