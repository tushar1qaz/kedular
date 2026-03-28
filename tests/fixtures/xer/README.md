# XER Test Fixtures

Real XER files for regression testing. Every file in this directory is tested
on every commit. The parser must handle all of them without crashing.

## Files

| File | Source | P6 Version | Notes |
|------|--------|------------|-------|
| minimal-valid.xer | Hand-crafted | N/A | Smallest valid XER with 2 activities |
| empty-schedule.xer | Hand-crafted | N/A | ERMHDR only, no TASK table |
| missing-taskpred.xer | Hand-crafted | N/A | Valid tasks, no relationships |
| field-mismatch.xer | Hand-crafted | N/A | Rows with wrong field counts |

## How to add real XER files

1. Export from your P6 installation (File → Export → XER)
2. Copy the .xer file here
3. Rename to `real-world-[project-name].xer`
4. Document the P6 version and project type in this table
5. Run tests to verify the parser handles it

## Sources for test XER files

- Your own P6 installation
- Plan Academy tutorials (https://www.planacademy.com)
- PyP6Xer test suite (https://github.com/HassanEmam/PyP6Xer/tree/master/tests)
- GitHub search for `.xer` files in public repos
