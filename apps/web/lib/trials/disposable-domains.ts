// Throwaway / disposable email providers. A small, vetted subset of the public
// community list (github.com/disposable-email-domains/disposable-email-domains)
// covering the services people actually use to farm free trials. Deliberately
// conservative: only domains whose sole purpose is temporary inboxes — never a
// real mailbox provider. Matching also covers subdomains (x.mailinator.com).

const DOMAINS = [
  // Mailinator family
  "mailinator.com", "mailinator.net", "mailinator.org", "mailinator2.com", "mailinater.com",
  "notmailinator.com", "reallymymail.com", "sogetthis.com", "spamherelots.com", "thisisnotmyrealemail.com",
  "suremail.info", "binkmail.com", "bobmail.info", "chammy.info", "devnullmail.com", "letthemeatspam.com",
  "mailinator.us", "safetymail.info", "tradermail.info", "veryrealemail.com", "zippymail.info",
  // Guerrilla Mail family
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de",
  "guerrillamail.info", "guerrillamailblock.com", "grr.la", "sharklasers.com", "pokemail.net", "spam4.me",
  // 10 Minute Mail & co.
  "10minutemail.com", "10minutemail.net", "10minutemail.org", "10minutemail.co.uk", "10minutemail.de",
  "10minemail.com", "10mail.org", "20minutemail.com", "20minutemail.it", "30minutemail.com",
  "33mail.com", "minutemail.com", "10minut.com.pl", "10minutesmail.com", "10minutesmail.net",
  "tenminutemail.com", "tenminutemail.net",
  // Temp-Mail & clones
  "temp-mail.org", "temp-mail.io", "temp-mail.ru", "tempmail.com", "tempmail.net", "tempmail.org",
  "tempmail.de", "tempmail.us", "tempmail.dev", "tempmail.plus", "tempmailo.com", "tempmail2.com",
  "tempmailaddress.com", "tempinbox.com", "tempinbox.co.uk", "tempail.com", "tempemail.com",
  "tempemail.net", "tempemail.co", "tempr.email", "temporaryemail.net", "temporaryemail.us",
  "temporaryinbox.com", "temporarymail.org", "tmpmail.org", "tmpmail.net", "tmpeml.com", "tmail.ws",
  "tmails.net", "mytemp.email", "mytempemail.com", "temp.email", "tempm.com", "tempomail.fr",
  "fakemail.net", "fakeinbox.com", "fakemailgenerator.com", "fake-mail.ml", "emailfake.com",
  "throwawaymail.com", "throwam.com", "throwawayemailaddress.com", "byom.de",
  // YOPmail family
  "yopmail.com", "yopmail.net", "yopmail.fr", "yopmail.org", "cool.fr.nf", "jetable.fr.nf",
  "nospam.ze.tc", "nomail.xl.cx", "mega.zik.dj", "speed.1s.fr", "courriel.fr.nf", "moncourrier.fr.nf",
  "monemail.fr.nf", "monmail.fr.nf",
  // TrashMail family
  "trashmail.com", "trashmail.net", "trashmail.org", "trashmail.de", "trashmail.at", "trashmail.me",
  "trashmail.io", "trashmail.ws", "trashmailer.com", "trash-mail.com", "trash-mail.de", "trash2009.com",
  "trashymail.com", "trashymail.net", "wegwerfmail.de", "wegwerfmail.net", "wegwerfmail.org",
  "kurzepost.de", "objectmail.com", "proxymail.eu", "rcpt.at",
  // Maildrop / Mailnesia / Dispostable / others
  "maildrop.cc", "mailnesia.com", "dispostable.com", "discard.email", "discardmail.com",
  "discardmail.de", "spambox.us", "spamgourmet.com", "spamgourmet.net", "spamgourmet.org",
  "spamex.com", "spamfree24.org", "spaml.com", "spaml.de", "spamavert.com", "spambog.com",
  "spambog.de", "spambog.ru", "spamday.com", "spamdecoy.net", "spamspot.com", "spamthis.co.uk",
  "mailcatch.com", "mailexpire.com", "mailmoat.com", "mailnull.com", "mailshell.com", "mailsac.com",
  "mailtemp.info", "mailtothis.com", "mailzilla.com", "mintemail.com", "mohmal.com", "mt2015.com",
  "getnada.com", "nada.email", "getairmail.com", "inboxbear.com", "inboxkitten.com", "harakirimail.com",
  "emailondeck.com", "email-temp.com", "emailtemporanea.com", "emailtemporanea.net", "emailsensei.com",
  "emltmp.com", "anonbox.net", "anonymbox.com", "burnermail.io", "deadaddress.com", "despam.it",
  "dodgeit.com", "dodgit.com", "e4ward.com", "easytrashmail.com", "einrot.com", "fakedemail.com",
  "filzmail.com", "getonemail.com", "haltospam.com", "incognitomail.com", "incognitomail.org",
  "jetable.com", "jetable.net", "jetable.org", "kasmail.com", "klzlk.com", "lroid.com",
  "mail-temporaire.fr", "mailforspam.com", "mailimate.com", "meltmail.com", "mvrht.com",
  "mx0.wwwnew.eu", "no-spam.ws", "nowmymail.com", "onewaymail.com", "owlymail.com", "pookmail.com",
  "quickinbox.com", "rmqkr.net", "rppkn.com", "shieldemail.com", "slopsbox.com", "smellfear.com",
  "snakemail.com", "sofort-mail.de", "spoofmail.de", "superrito.com", "teleworm.us", "armyspy.com",
  "cuvox.de", "dayrep.com", "einrot.de", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com",
  "tempsky.com", "trbvm.com", "twzhhq.online", "wh4f.org", "yomail.info", "zetmail.com",
  "dropmail.me", "10mail.tk", "emailna.co", "linshiyouxiang.net", "moakt.com", "moakt.cc",
  "tmpbox.net", "vomoto.com", "xojxe.com", "zzrgg.com", "mailpoof.com", "luxusmail.org",
  "spamcowboy.com", "spamcowboy.net", "spamcowboy.org", "mailbox52.ga", "guerrillamail.ga",
] as const

export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set(DOMAINS)

/** True if the email's domain (or any parent domain) is a known throwaway inbox. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@")
  if (at < 0) return false
  const domain = email.slice(at + 1).trim().toLowerCase().replace(/\.$/, "")
  if (!domain) return false
  const parts = domain.split(".")
  // Check "a.b.mailinator.com", "b.mailinator.com", "mailinator.com".
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_EMAIL_DOMAINS.has(parts.slice(i).join("."))) return true
  }
  return false
}

export const DISPOSABLE_EMAIL_MESSAGE =
  "Please use a permanent email address — temporary inboxes can't receive your billing and account emails."
