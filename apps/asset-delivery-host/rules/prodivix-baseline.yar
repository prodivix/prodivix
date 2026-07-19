rule PRODIVIX_EICAR_TEST_FILE : prodivix_baseline {
  meta:
    policy = "prodivix-baseline-v1"
    purpose = "antivirus interoperability test"

  strings:
    $eicar = {
      58 35 4F 21 50 25 40 41 50 5B 34 5C 50 5A 58 35
      34 28 50 5E 29 37 43 43 29 37 7D 24 45 49 43 41
      52 2D 53 54 41 4E 44 41 52 44 2D 41 4E 54 49 56
      49 52 55 53 2D 54 45 53 54 2D 46 49 4C 45 21 24
      48 2B 48 2A
    }

  condition:
    filesize == 68 and $eicar at 0
}

rule PRODIVIX_YARAX_GATE_CANARY : prodivix_baseline {
  meta:
    policy = "prodivix-baseline-v1"
    purpose = "isolated scanner integration gate"

  strings:
    $canary = "PRODIVIX-YARAX-GATE-CANARY-v1" ascii

  condition:
    filesize <= 1024 and $canary
}
