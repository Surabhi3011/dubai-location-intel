-- Community sales KPIs, trailing 12 complete months vs the prior 12, plus 3m momentum.
-- Variables: w12_start, w12_end (exclusive), p12_start, w3_start, p3_start.
with s as (select * from sales_clean where community_id is not null)
select
    community_id,
    count(*) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end'))            as sales_12m,
    count(*) filter (where month >= getvariable('p12_start') and month < getvariable('w12_start'))          as sales_prev_12m,
    sum(price) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end'))          as value_12m,
    count(psf) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end'))          as n_psf_12m,
    median(psf) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end'))         as psf_12m,
    median(psf) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end') and ptype = 'apartment') as psf_apartment_12m,
    median(psf) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end') and ptype = 'villa')     as psf_villa_12m,
    median(price) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end'))       as price_12m,
    count(psf) filter (where month >= getvariable('p12_start') and month < getvariable('w12_start'))        as n_psf_prev_12m,
    median(psf) filter (where month >= getvariable('p12_start') and month < getvariable('w12_start'))       as psf_prev_12m,
    count(psf) filter (where month >= getvariable('w3_start') and month < getvariable('w12_end'))           as n_psf_3m,
    median(psf) filter (where month >= getvariable('w3_start') and month < getvariable('w12_end'))          as psf_3m,
    count(psf) filter (where month >= getvariable('p3_start') and month < getvariable('w3_start'))          as n_psf_prev_3m,
    median(psf) filter (where month >= getvariable('p3_start') and month < getvariable('w3_start'))         as psf_prev_3m,
    count(*) filter (where month >= getvariable('w12_start') and month < getvariable('w12_end') and market = 'offplan') as offplan_12m
from s
group by community_id
