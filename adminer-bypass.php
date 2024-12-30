<?php
class AdminerLoginBypass {
	function __construct() {
		if ($_SERVER["REQUEST_URI"] == "/") {
			$_POST["auth"] = array(
        "driver" => "server",
        "server" => "db",
        "username" => "knwst",
        "password" => "knwst",
        "db" => "knwst"
      );
		}
	}

  function credentials() {
    return array("db", "knwst", "knwst");
  }

  function login($login, $password) {
    return true;
  }
}
